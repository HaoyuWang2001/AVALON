/**
 * AI 机器人 HTTP 客户端 — 供 AI 导演（opencode 会话）驱动对局使用。
 *
 * 协议：与微信小程序一致，通过 HTTP 调用线上后端（无鉴权，openId 直接传 body）。
 * 用法示例（本地 node 运行）：
 *   node scripts/ai-http.js join --room=ABC123 --openId=bot_a --seat=2
 *   node scripts/ai-http.js state --game=GAME_ID --openId=bot_a
 *   node scripts/ai-http.js ready --room=ABC123 --openId=bot_a
 *   node scripts/ai-http.js start --room=ABC123 --openId=HOST_ID
 *   node scripts/ai-http.js advance --game=GAME_ID
 *   node scripts/ai-http.js discussion --game=GAME_ID --openId=bot_a --order=asc
 *   node scripts/ai-http.js nominate --game=GAME_ID --openId=bot_a --team=a,b,c --forced=0
 *   node scripts/ai-http.js teamvote --game=GAME_ID --openId=bot_a --vote=approve
 *   node scripts/ai-http.js missionvote --game=GAME_ID --openId=bot_a --vote=fail --role=assassin
 *   node scripts/ai-http.js assassinate --game=GAME_ID --openId=bot_a --target=bot_b
 *   node scripts/ai-http.js abandon --game=GAME_ID --openId=HOST_ID
 *   node scripts/ai-http.js room --room=ABC123
 *   node scripts/ai-http.js create --openId=bot_host --count=5   # 建房+4bot入座+全部准备
 */

const https = require('https');

const BASE = process.env.AI_API_BASE || 'https://haoyu-wang141.top:8082/api';

function request(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'haoyu-wang141.top',
      port: 8082,
      path: `/api${apiPath}`,
      method,
      rejectUnauthorized: false,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(s) }); }
        catch (e) { resolve({ status: res.statusCode, body: { raw: s } }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const STANDARD_ROLE_CONFIG = {
  roles: { good: ['merlin', 'percival', 'loyal'], evil: ['morgana', 'assassin'] },
  rules: {
    evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
    ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
    oberonMustFailMission: false, lancelotMustFail: false,
    voteVisibility: 'anonymous', missionFailDetail: 'count',
    evilsKnowRedLancelot: true, oberonKnowsRedLancelot: true, merlinKnowsLancelotSide: true
  },
  limits: {},
  meta: { roomName: 'AI测试房', roomDescription: '', tags: [] },
  merlinVision: { canSee: ['assassin', 'morgana', 'minion', 'oberon'], canIdentify: [] }
};

function arg(name, def) {
  const prefix = '--' + name + '=';
  const eq = process.argv.find(a => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf('--' + name);
  if (idx === -1 || idx + 1 >= process.argv.length) return def;
  return process.argv[idx + 1];
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) { console.error('缺少命令'); process.exit(1); }
  let res;

  switch (cmd) {
    case 'create': {
      const openId = arg('openId');
      const count = parseInt(arg('count', '5'), 10);
      const hostNick = arg('nick', 'AI房主');
      res = await request('POST', '/rooms/create', {
        hostOpenId: openId, hostNickName: hostNick, hostAvatarUrl: '', roomConfig: STANDARD_ROLE_CONFIG
      });
      if (!res.body || res.body.success !== true) { console.log(JSON.stringify(res.body)); process.exit(1); }
      const roomId = res.body.roomId;
      const ids = [openId];
      for (let i = 2; i <= count; i++) {
        const bid = `${arg('prefix', 'bot')}_s${i}`;
        ids.push(bid);
        const j = await request('POST', '/rooms/join', {
          roomId, userInfo: { openId: bid, nickName: `AI${i}号`, avatarUrl: '' }, seatNumber: i, customNickName: `AI${i}号`
        });
        if (!j.body || j.body.success !== true) { console.log('JOIN_FAIL', JSON.stringify(j.body)); process.exit(1); }
      }
      for (const id of ids) {
        await request('POST', '/rooms/toggleReady', { roomId, openId: id, isReady: true });
      }
      console.log(JSON.stringify({ success: true, roomId, hostId: openId, players: ids }));
      break;
    }
    case 'join': {
      res = await request('POST', '/rooms/join', {
        roomId: arg('room'), userInfo: { openId: arg('openId'), nickName: arg('nick', 'AI'), avatarUrl: '' },
        seatNumber: parseInt(arg('seat', '0'), 10), customNickName: arg('nick', 'AI')
      });
      console.log(JSON.stringify(res.body));
      break;
    }
    case 'ready':
      res = await request('POST', '/rooms/toggleReady', { roomId: arg('room'), openId: arg('openId'), isReady: arg('value', 'true') === 'true' });
      console.log(JSON.stringify(res.body));
      break;
    case 'start':
      res = await request('POST', '/games/start', { roomId: arg('room'), openId: arg('openId') });
      console.log(JSON.stringify(res.body));
      break;
    case 'room':
      res = await request('GET', `/rooms/${arg('room')}`);
      console.log(JSON.stringify(res.body));
      break;
    case 'state':
      res = await request('GET', `/games/${arg('game')}?openId=${arg('openId', '')}`);
      console.log(JSON.stringify(res.body));
      break;
    case 'advance':
      res = await request('POST', `/games/${arg('game')}/advancePhase`, {});
      console.log(JSON.stringify(res.body));
      break;
    case 'discussion':
      res = await request('POST', '/games/setDiscussion', {
        gameId: arg('game'), openId: arg('openId'), speakingOrder: arg('order', 'asc')
      });
      console.log(JSON.stringify(res.body));
      break;
    case 'nominate': {
      const team = arg('team', '').split(',').filter(Boolean);
      const body = { gameId: arg('game'), openId: arg('openId'), nominatedTeam: team };
      if (arg('forced') === '1') body.forcedCar = true;
      res = await request('POST', '/games/submitNomination', body);
      console.log(JSON.stringify(res.body));
      break;
    }
    case 'teamvote':
      res = await request('POST', '/games/castVote', { gameId: arg('game'), openId: arg('openId'), vote: arg('vote') });
      console.log(JSON.stringify(res.body));
      break;
    case 'missionvote':
      res = await request('POST', '/games/castMissionVote', {
        gameId: arg('game'), openId: arg('openId'), vote: arg('vote'), playerRole: arg('role', 'loyal')
      });
      console.log(JSON.stringify(res.body));
      break;
    case 'assassinate':
      res = await request('POST', `/games/${arg('game')}/assassinate`, {
        killerOpenId: arg('openId'), targetOpenId: arg('target')
      });
      console.log(JSON.stringify(res.body));
      break;
    case 'abandon':
      res = await request('POST', `/games/${arg('game')}/abandon`, { openId: arg('openId') });
      console.log(JSON.stringify(res.body));
      break;
    case 'leave':
      res = await request('POST', '/rooms/leave', { roomId: arg('room'), openId: arg('openId') });
      console.log(JSON.stringify(res.body));
      break;
    default:
      console.error('未知命令: ' + cmd);
      process.exit(1);
  }
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
