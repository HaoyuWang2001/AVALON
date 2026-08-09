#!/usr/bin/env node
/**
 * AVALON 线上对局自动驱动脚本（状态机驱动，幂等可恢复）。
 * 供 AI 导演（opencode 会话）或测试脚本按剧本驱动一局完整游戏，
 * 覆盖 roleReveal / 发言 / 提名 / 队伍投票 / 任务投票 / 湖仙验人 /
 * 兰斯洛特转换 / 强制车 / 皇冠 / 刺杀 等全流程，默认每步间隔 10s。
 *
 * 用法：
 *   node scripts/drive-game.js --game=GAME_ID --script=drive-scripts/example.json
 *   node scripts/drive-game.js --game=GAME_ID --script=... --interval=10 --viewer=OPENID
 *
 * 剧本 JSON 结构（轮次键为 1..5，缺省字段有合理默认）：
 *   {
 *     "roles": { "openId": "role" },        // 用于 missionVote 的 playerRole（必填）
 *     "assassinate": { "killer": "...", "target": "..." },  // 可选：刺杀阶段
 *     "rounds": {
 *       "1": {
 *         "team":       ["openId"...],      // 队长最终提名队伍（缺省=preTeam）
 *         "preTeam":    ["openId"...],      // 预选队伍（缺省=team，均可省略）
 *         "teamVotes":  { "openId": "approve|reject" },  // 覆盖默认 approve
 *         "mission":    { "openId": "success|fail", "_default": "success" },
 *         "lake":       "targetOpenId"      // 可选：本轮湖仙验人目标
 *       },
 *       "3": {                             // 流车+强制车轮：
 *         "flowReject": true,               // 连续全否决直到 failedNominations>=maxFailed
 *         "forcedTeam": ["openId"...],      // 强制车队伍（第 maxFailed+1 次提名）
 *         "maxFailed": 3                    // 缺省取房间规则 maxFailedNominations
 *       }
 *     }
 *   }
 */

const https = require('https');
const fs = require('fs');

const BASE = process.env.AI_API_BASE || 'https://haoyu-wang141.top:8082/api';
const { URL } = require('url');
const baseUrl = new URL(BASE);

function arg(name, def) {
  const prefix = '--' + name + '=';
  const eq = process.argv.find(a => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf('--' + name);
  if (idx === -1 || idx + 1 >= process.argv.length) return def;
  return process.argv[idx + 1];
}

const GAME = arg('game', '');
const SCRIPT_PATH = arg('script', '');
const VIEWER = arg('viewer', '');
const SLEEP = parseInt(arg('interval', '10'), 10) * 1000;

if (!GAME || !SCRIPT_PATH) {
  console.error('用法: node scripts/drive-game.js --game=GAME_ID --script=path/to/script.json [--interval=10] [--viewer=OPENID]');
  process.exit(1);
}

const SCRIPT = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
const ROUNDS = SCRIPT.rounds || {};
const ROLE = SCRIPT.roles || {};
const ASSASSINATE = SCRIPT.assassinate || null;

function log(msg) { console.log(new Date().toISOString().slice(11, 19), msg); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: baseUrl.hostname, port: baseUrl.port || 8082, path: baseUrl.pathname + apiPath, method,
      rejectUnauthorized: false,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve({ raw: s }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = () => api('GET', `/games/${GAME}${VIEWER ? '?openId=' + VIEWER : ''}`);

async function act(label, fn) {
  log('▶ ' + label);
  const r = await fn();
  if (r && r.success === false) {
    log('✗ ' + label + ' 失败: ' + JSON.stringify(r));
    throw new Error(label + ' 失败: ' + (r.message || JSON.stringify(r)));
  }
  log('  ✓ ' + (r && r.message ? r.message : 'ok'));
  return r;
}

async function confirmAll(kind) {
  const s = await get();
  const all = (s.players || []).map(p => p.openId);
  const path = `/games/${GAME}/` + (kind === 'reveal' ? 'confirmReveal'
    : kind === 'lake' ? 'confirmLake' : 'confirmLancelot');
  for (const b of all) await api('POST', path, { openId: b });
}

async function waitPhase(notPhase, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await get();
    if (s.current.phase !== notPhase) return s;
    await sleep(2500);
  }
  throw new Error('waitPhase 超时, 仍处于 ' + notPhase);
}

async function main() {
  while (true) {
    const s = await get();
    if (!s || !s.current) { log('✗ 状态异常: ' + JSON.stringify(s)); process.exit(1); }
    const ph = s.current.phase;
    const round = s.current.round;
    const leader = s.current.teamLeaderOpenId;
    const rules = (s.basic.roomConfig && s.basic.roomConfig.rules) || {};
    if (s.basic.status === 'ended' || ph === 'gameEnd') { log('■ 游戏结束: ' + JSON.stringify(s.basic.result)); break; }
    log(`== phase=${ph} round=${round} leader=${leader} failNom=${s.current.failedNominations} forced=${s.current.isForcedCar} crown=${s.current.crownHolderOpenId || 'null'}`);

    const sc = ROUNDS[round] || {};
    const maxFailed = sc.maxFailed || rules.maxFailedNominations || 3;
    const team = sc.team || sc.preTeam || null;
    const preTeam = sc.preTeam || team || [];

    if (ph === 'roleReveal') {
      await act('roleReveal 全员确认', async () => { await confirmAll('reveal'); return { success: true }; });
    } else if (ph === 'preNominate') {
      await act('preNominate 队长预选', () => api('POST', '/games/preNominate', { gameId: GAME, openId: leader, preNominatedTeam: preTeam }));
    } else if (ph === 'speakingOrder') {
      await act('speakingOrder + startDiscussion', async () => {
        await api('POST', '/games/speakingOrder', { gameId: GAME, openId: leader, speakingOrder: 'asc' });
        return api('POST', '/games/startDiscussion', { gameId: GAME, openId: leader });
      });
    } else if (ph === 'discussion') {
      await act('endDiscussion', () => api('POST', '/games/endDiscussion', { gameId: GAME, openId: leader }));
    } else if (ph === 'teamNomination') {
      const forced = !!(sc.flowReject && s.current.failedNominations >= maxFailed);
      const nomTeam = forced ? sc.forcedTeam : (sc.flowReject ? (sc.forcedTeam || team) : team);
      await act(`nominate ${forced ? '强制车(forced)' : (sc.flowReject ? '流车候选' : '')} (failed=${s.current.failedNominations})`,
        () => api('POST', '/games/submitNomination', { gameId: GAME, openId: leader, nominatedTeam: nomTeam, forcedCar: forced }));
    } else if (ph === 'teamVote') {
      const votes = {};
      const all = (s.players || []).map(p => p.openId);
      for (const b of all) {
        votes[b] = sc.flowReject ? 'reject' : ((sc.teamVotes && sc.teamVotes[b]) || 'approve');
      }
      const rejects = all.filter(b => votes[b] === 'reject');
      await act(`teamVote 全员投票 (reject=${rejects.join(',')})`, async () => {
        for (const b of all) await api('POST', '/games/castVote', { gameId: GAME, openId: b, vote: votes[b] });
        return { success: true };
      });
    } else if (ph === 'teamVoteReveal') {
      await waitPhase('teamVoteReveal', 20000);
      log('  票型展示结束，自动推进');
    } else if (ph === 'missionVote') {
      const m = sc.mission || {};
      const teamN = s.current.nominatedTeam || [];
      await act(`missionVote 队伍 ${teamN.join(',')}`, async () => {
        for (const b of teamN) {
          const v = (m && (m[b] !== undefined ? m[b] : m._default)) || 'success';
          await api('POST', '/games/castMissionVote', { gameId: GAME, openId: b, vote: v, playerRole: ROLE[b] || 'loyal' });
        }
        return { success: true };
      });
    } else if (ph === 'lake') {
      const target = sc.lake;
      if (!target) { log('✗ 本轮湖仙未配置 lake 目标'); process.exit(1); }
      await act(`lake ${s.current.lakeHolderOpenId} 验 ${target}`, () => api('POST', `/games/${GAME}/lakeInspect`, { openId: s.current.lakeHolderOpenId, targetOpenId: target }));
    } else if (ph === 'lakeConfirm') {
      await act('lakeConfirm 全员确认', async () => { await confirmAll('lake'); return { success: true }; });
    } else if (ph === 'lancelot') {
      await act('lancelot 全员确认抽卡', async () => { await confirmAll('lancelot'); return { success: true }; });
    } else if (ph === 'assassination') {
      if (!ASSASSINATE) { log('✗ 进入刺杀阶段但剧本未配置 assassinate'); process.exit(1); }
      await act(`assassin ${ASSASSINATE.killer} 刺杀 ${ASSASSINATE.target}`,
        () => api('POST', `/games/${GAME}/assassinate`, { killerOpenId: ASSASSINATE.killer, targetOpenId: ASSASSINATE.target }));
    } else {
      log('✗ 未知阶段: ' + ph);
      process.exit(1);
    }

    await sleep(SLEEP);
  }
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
