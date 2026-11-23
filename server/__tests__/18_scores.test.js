const db = require('../config/db');
const scoring = require('../utils/scoring');
const ScoreModel = require('../models/ScoreModel');
const { apiGet } = require('./helpers/testHelper');

const TS = Date.now();
const gid = `score_game_${TS}`;

describe('18 — 计分制', () => {
  beforeAll(async () => {
    await db.initPool();
  });

  describe('18-A 纯函数与数学性质', () => {
    it('18-1 基础分按人数查表（人少更低）', () => {
      const expected = { 5: 0.20, 6: 0.25, 7: 0.30, 8: 0.35, 9: 0.45, 10: 0.50, 11: 0.50, 12: 0.50 };
      for (let n = 5; n <= 12; n++) {
        expect(scoring.baseScore(n)).toBe(expected[n]);
      }
      expect(scoring.baseScore(4)).toBe(0.20);
      expect(scoring.baseScore(13)).toBe(0.50);
    });

    it('18-2 胜/败分含人数系数（p∈[0.35,0.65]）', () => {
      for (let n = 5; n <= 12; n++) {
        expect(scoring.winScore(0.5, n)).toBe(Math.round(0.45 * scoring.WIN_SIZE[n] * 100) / 100);
        for (let p = 0.35; p <= 0.6501; p += 0.05) {
          const a = scoring.winScore(p, n);
          const l = scoring.lossScore(p, n);
          expect(a).toBeGreaterThanOrEqual(0.26);
          expect(a).toBeLessThanOrEqual(1.00);
          expect(l).toBeGreaterThanOrEqual(0.20);
          expect(l).toBeLessThanOrEqual(0.41);
        }
      }
    });

    it('18-3 平衡定理：两侧期望得分相等（舍入误差 ≤0.03）', () => {
      for (let n = 5; n <= 12; n++) {
        for (let p = 0.35; p <= 0.6501; p += 0.05) {
          const base = scoring.baseScore(n);
          const pGood = p;
          const pEvil = 1 - p;
          const Egood = base + pGood * scoring.winScore(pGood, n) - (1 - pGood) * scoring.lossScore(pGood, n);
          const Eevil = base + pEvil * scoring.winScore(pEvil, n) - (1 - pEvil) * scoring.lossScore(pEvil, n);
          expect(Math.abs(Egood - Eevil)).toBeLessThanOrEqual(0.03);
        }
      }
    });

    it('18-4 允许单局负分：小局败场可倒扣，且两位小数', () => {
      const factionStats = { 5: { good: { wins: 0, games: 100 }, evil: { wins: 100, games: 100 } } };
      const roleStats = { 5: { merlin: { wins: 0, games: 100 }, loyal: { wins: 100, games: 100 }, assassin: { wins: 100, games: 100 } } };
      const players = [
        { openId: 'a', side: 'good', role: 'merlin' },
        { openId: 'b', side: 'good', role: 'loyal' },
        { openId: 'c', side: 'evil', role: 'assassin' }
      ];
      const rows = scoring.scoreGame({ n: 5, winner: 'good', players, factionStats, roleStats, mvpVotes: {}, svpVotes: {} });
      const loser = rows.find(r => r.side === 'evil');
      expect(loser.total).toBeLessThan(0); // 5 人局 Base 0.20 < 败分
      rows.forEach(r => {
        expect(Math.round(r.total * 100) / 100).toBe(r.total);
      });
    });

    it('18-5 荣誉分：每票 0.01', () => {
      const rows = scoring.scoreGame({
        n: 5, winner: 'good',
        players: [
          { openId: 'a', side: 'good', role: 'loyal' },
          { openId: 'b', side: 'evil', role: 'minion' }
        ],
        factionStats: {}, roleStats: {},
        mvpVotes: { a: 3 }, svpVotes: { b: 2 }
      });
      const a = rows.find(r => r.openId === 'a');
      const b = rows.find(r => r.openId === 'b');
      expect(a.awardScore).toBe(0.03);
      expect(b.awardScore).toBe(0.02);
    });

    it('18-13 角色难度按人数分组', () => {
      const roleStats = {
        6: { merlin: { wins: 15, games: 33 } },
        7: { merlin: { wins: 12, games: 23 } },
        8: { merlin: { wins: 8, games: 17 } }
      };
      expect(scoring.roleWeight('merlin', 6, roleStats)).toBeCloseTo(0.0429, 3);
      expect(scoring.roleWeight('merlin', 8, roleStats)).toBeCloseTo(0.0263, 3);
      expect(scoring.roleWeight('merlin', 7, roleStats)).toBe(0);
      expect(scoring.roleWeight('merlin', 9, roleStats)).toBe(0);
    });

    it('18-14 挡刀分按人数缩放，且只给被刺好人', () => {
      const players = () => [
        { openId: 'm', side: 'good', role: 'merlin' },
        { openId: 'p', side: 'good', role: 'percival' },
        { openId: 'l', side: 'good', role: 'loyal' },
        { openId: 'o', side: 'evil', role: 'oberon' },
        { openId: 'a', side: 'evil', role: 'assassin' }
      ];
      const expected = { 5: 0.02, 6: 0.02, 7: 0.03, 8: 0.03, 9: 0.04, 10: 0.04, 11: 0.05, 12: 0.05 };
      for (const n of Object.keys(expected)) {
        const rows = scoring.scoreGame({
          n: Number(n), winner: 'good', players: players(),
          factionStats: {}, roleStats: {},
          assassination: { target: 'p', correct: false }
        });
        expect(rows.find(r => r.openId === 'p').blockScore).toBe(expected[n]);
        expect(rows.find(r => r.openId === 'm').blockScore).toBe(0);
        expect(rows.find(r => r.openId === 'l').blockScore).toBe(0);
      }
    });

    it('18-15 挡刀分仅蓝方胜利且未命中梅林时生效', () => {
      const players = [
        { openId: 'm', side: 'good', role: 'merlin' },
        { openId: 'p', side: 'good', role: 'percival' },
        { openId: 'l', side: 'good', role: 'loyal' },
        { openId: 'o', side: 'evil', role: 'oberon' },
        { openId: 'a', side: 'evil', role: 'assassin' }
      ];
      const baseOpts = { n: 8, players, factionStats: {}, roleStats: {}, mvpVotes: {}, svpVotes: {} };
      const hit = scoring.scoreGame({ ...baseOpts, winner: 'evil', assassination: { target: 'm', correct: true } });
      expect(hit.every(r => r.blockScore === 0)).toBe(true);

      const evilTarget = scoring.scoreGame({ ...baseOpts, winner: 'good', assassination: { target: 'o', correct: false } });
      expect(evilTarget.every(r => r.blockScore === 0)).toBe(true);

      const noShot = scoring.scoreGame({ ...baseOpts, winner: 'good' });
      expect(noShot.every(r => r.blockScore === 0)).toBe(true);

      const blocked = scoring.scoreGame({ ...baseOpts, winner: 'good', assassination: { target: 'p', correct: false } });
      const plain = scoring.scoreGame({ ...baseOpts, winner: 'good' });
      const pBlocked = blocked.find(r => r.openId === 'p');
      const pPlain = plain.find(r => r.openId === 'p');
      expect(pBlocked.blockScore).toBe(0.03);
      expect(pBlocked.total - pPlain.total).toBeCloseTo(0.03, 5);
    });
  });

  describe('18-B 落库与回填', () => {
    beforeAll(async () => {
      await db.query(
        `INSERT INTO games (id, room_id, room_number, source, owner_id, current_phase, game_result, status, ended_at)
         VALUES (?, NULL, '987654', 'online', 'score_host', 'gameEnd', ?, 'ended', NOW())`,
        [gid, JSON.stringify({ winner: 'good', reason: 'test' })]
      );
      const players = [
        ['sco_m', 'merlin', 'good'],
        ['sco_l', 'loyal', 'good'],
        ['sco_a', 'assassin', 'evil'],
        ['sco_g', 'morgana', 'evil']
      ];
      for (const [oid, role, side] of players) {
        await db.query(
          `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [gid, oid, role, side, oid, 1]
        );
      }
      // 2 张 MVP 票投给梅林，1 张 SVP 票给刺客
      await db.query(
        `INSERT INTO game_award_votes (game_id, voter_open_id, award, state, target_open_id) VALUES
         (?, 'sco_l', 'mvp', 'voted', 'sco_m'),
         (?, 'sco_a', 'mvp', 'voted', 'sco_m'),
         (?, 'sco_m', 'svp', 'voted', 'sco_a')`,
        [gid, gid, gid]
      );
    });

    it('18-6 computeAndSave 写入明细（胜负分方向/票分/两位小数）', async () => {
      const r = await ScoreModel.computeAndSave(gid);
      expect(r.skipped).toBe(false);
      expect(r.count).toBe(4);
      const rows = await db.query('SELECT open_id AS openId, side, win_score AS winScore, role_score AS roleScore, award_score AS awardScore, total FROM game_player_scores WHERE game_id = ? ORDER BY open_id', [gid]);
      expect(rows.length).toBe(4);
      rows.forEach(row => {
        expect(Math.round(Number(row.total) * 100) / 100).toBe(Number(row.total));
      });
      const merlin = rows.find(x => x.openId === 'sco_m');
      const assassin = rows.find(x => x.openId === 'sco_a');
      const loyal = rows.find(x => x.openId === 'sco_l');
      expect(Number(merlin.winScore)).toBeGreaterThan(0);
      expect(Number(assassin.winScore)).toBeLessThan(0);
      expect(Number(merlin.awardScore)).toBe(0.02);
      expect(Number(assassin.awardScore)).toBe(0.01);
      expect(Number(assassin.total)).toBeLessThan(Number(merlin.total));
      // 胜方角色分内部零和（舍入误差 ≤0.02）
      const winnersRoleSum = rows.filter(x => x.side === 'good').reduce((a, x) => a + Number(x.roleScore), 0);
      expect(Math.abs(winnersRoleSum)).toBeLessThanOrEqual(0.02);
      expect(Number(loyal.winScore)).toBeGreaterThan(0);
    });

    it('18-7 幂等：重复计算不产生重复行且数值一致', async () => {
      const before = await db.query('SELECT open_id, total FROM game_player_scores WHERE game_id = ? ORDER BY open_id', [gid]);
      await ScoreModel.computeAndSave(gid);
      const after = await db.query('SELECT open_id, total FROM game_player_scores WHERE game_id = ? ORDER BY open_id', [gid]);
      expect(after.length).toBe(before.length);
      expect(after.map(r => Number(r.total))).toEqual(before.map(r => Number(r.total)));
    });

    it('18-8 新增票后重算，票分增加 0.01', async () => {
      const before = await db.query("SELECT award_score AS a FROM game_player_scores WHERE game_id = ? AND open_id = 'sco_m'", [gid]);
      await db.query(
        `INSERT INTO game_award_votes (game_id, voter_open_id, award, state, target_open_id)
         VALUES (?, 'sco_g', 'mvp', 'voted', 'sco_m')`,
        [gid]
      );
      await ScoreModel.computeAndSave(gid);
      const after = await db.query("SELECT award_score AS a FROM game_player_scores WHERE game_id = ? AND open_id = 'sco_m'", [gid]);
      expect(Number(after[0].a) - Number(before[0].a)).toBeCloseTo(0.01, 5);
    });

    it('18-9 线下/异常局不计分', async () => {
      const offId = `score_off_${TS}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, source, owner_id, current_phase, game_result, status, ended_at)
         VALUES (?, NULL, '987655', 'offline', 'score_host', 'gameEnd', ?, 'ended', NOW())`,
        [offId, JSON.stringify({ winner: 'good', reason: 'offline' })]
      );
      await db.query(
        `INSERT INTO game_players (game_id, open_id, role, side) VALUES (?, 'off_a', 'merlin', 'good'), (?, 'off_b', 'assassin', 'evil')`,
        [offId, offId]
      );
      const r = await ScoreModel.computeAndSave(offId);
      expect(r.skipped).toBe(true);
      const rows = await db.query('SELECT * FROM game_player_scores WHERE game_id = ?', [offId]);
      expect(rows.length).toBe(0);
    });

    it('18-11 个人 stats 下发积分明细（rawTotal/保底/求和一致）', async () => {
      const res = await apiGet('/api/games/stats?subjectOpenId=sco_m&viewerOpenId=sco_m');
      expect(res.status).toBe(200);
      const s = res.body.stats;
      expect(s.score).toBeGreaterThan(0);
      const d = s.scoreDetail;
      expect(d).toBeTruthy();
      expect(d.games).toBeGreaterThanOrEqual(1);
      expect(d.wins + d.losses).toBe(d.games);
      expect(typeof d.blockSum).toBe('number');
      const sum = Math.round((d.baseSum + d.winSum + d.roleSum + d.awardSum + d.blockSum) * 100) / 100;
      expect(Math.abs(sum - d.rawTotal)).toBeLessThanOrEqual(0.02);
      expect(d.total).toBe(Math.max(0, d.rawTotal));
      expect(d.floored).toBe(d.rawTotal < 0);
      expect(d.total).toBe(s.score);
      expect(typeof d.avg).toBe('number');
    });

    it('18-10 backfillAll 可全量重算', async () => {
      const res = await ScoreModel.backfillAll();
      expect(res.total).toBeGreaterThanOrEqual(1);
      expect(res.games).toBeGreaterThanOrEqual(1);
      const rows = await db.query('SELECT COUNT(*) AS c FROM game_player_scores WHERE game_id = ?', [gid]);
      expect(Number(rows[0].c)).toBe(4);
    });

    it('18-12 累计保底：原始合计为负时积分按 0 计（明细保留原始值）', async () => {
      const negId = `score_neg_${TS}`;
      const uid = `sco_neg_${TS}`;
      await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 1) ON DUPLICATE KEY UPDATE public_winrate = 1', [uid]);
      await db.query('DELETE FROM game_player_scores WHERE open_id = ?', [uid]);
      await db.query(
        `INSERT INTO games (id, room_id, room_number, source, owner_id, current_phase, game_result, status, ended_at)
         VALUES (?, NULL, '987656', 'online', ?, 'gameEnd', ?, 'ended', NOW())`,
        [negId, uid, JSON.stringify({ winner: 'good' })]
      );
      await db.query(
        `INSERT INTO game_player_scores (game_id, open_id, side, role, base, win_score, role_score, award_score, total)
         VALUES (?, ?, 'evil', 'assassin', 0.20, -0.29, 0, 0, -0.09)`,
        [negId, uid]
      );
      const res = await apiGet(`/api/games/stats?subjectOpenId=${uid}&viewerOpenId=${uid}`);
      const s = res.body.stats;
      expect(s.score).toBe(0);
      expect(s.scoreDetail.rawTotal).toBeCloseTo(-0.09, 2);
      expect(s.scoreDetail.total).toBe(0);
      expect(s.scoreDetail.floored).toBe(true);
    });

    it('18-16 computeAndSave 写入挡刀分（蓝方未命中好人）', async () => {
      const bid = `score_block_${TS}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, source, owner_id, current_phase, game_result, assassination, status, ended_at)
         VALUES (?, NULL, '987657', 'online', 'score_host', 'gameEnd', ?, ?, 'ended', NOW())`,
        [bid, JSON.stringify({ winner: 'good' }), JSON.stringify({ target: 'blk_p', correct: false })]
      );
      const players = [
        ['blk_m', 'merlin', 'good'],
        ['blk_p', 'percival', 'good'],
        ['blk_l1', 'loyal', 'good'],
        ['blk_l2', 'loyal', 'good'],
        ['blk_a', 'assassin', 'evil']
      ];
      for (const [oid, role, side] of players) {
        await db.query(
          `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [bid, oid, role, side, oid, 1]
        );
      }
      const r = await ScoreModel.computeAndSave(bid);
      expect(r.skipped).toBe(false);
      const rows = await db.query(
        `SELECT open_id AS openId, base, win_score AS winScore, role_score AS roleScore,
                award_score AS awardScore, block_score AS blockScore, total
         FROM game_player_scores WHERE game_id = ?`,
        [bid]
      );
      const p = rows.find(x => x.openId === 'blk_p');
      expect(Number(p.blockScore)).toBe(0.02); // 5 人局
      rows.forEach(x => {
        if (x.openId !== 'blk_p') expect(Number(x.blockScore)).toBe(0);
        const expected = Math.round((
          Number(x.base) + Number(x.winScore) + Number(x.roleScore) +
          Number(x.awardScore) + Number(x.blockScore)
        ) * 100) / 100;
        expect(Number(x.total)).toBeCloseTo(expected, 5);
      });
    });
  });
});
