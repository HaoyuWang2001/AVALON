const { createRoomAndStartGame, endGame, apiGet } = require('./helpers/testHelper');
const db = require('../config/db');
const GameModel = require('../models/GameModel');

// 总胜率排名：/games/stats 返回 rank（与 champions 同口径；胜率与场次均相同 → 并列同名次；机器人房 000000 排除）
describe('13 — 总胜率排名', () => {
  beforeAll(async () => { await db.initPool(); });
  afterAll(() => { GameModel._winrateThresholdCache = null; });

  it('13-1 无对局玩家 rank 为 null', async () => {
    const ghost = `test_rank_ghost_${Date.now()}`;
    const res = await apiGet(`/api/games/stats?subjectOpenId=${ghost}&viewerOpenId=${ghost}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toHaveProperty('rank');
    expect(res.body.stats.rank).toBeNull();
  });

  it('13-2 冠军榜第一名 rank 为 1（与 champions 同口径）', async () => {
    const ch = await apiGet('/api/games/stats/champions?limit=1');
    expect(ch.status).toBe(200);
    if (!ch.body.champions || ch.body.champions.length === 0) return;
    const top = ch.body.champions[0];
    const res = await apiGet(`/api/games/stats?subjectOpenId=${top.openId}&viewerOpenId=${top.openId}`);
    expect(res.body.stats.rank).toBe(1);
  });

  it('13-3 并列同名次 + 场次多者靠前（纯计算）', () => {
    const list = [
      { openId: 'A', games: 2, wins: 2 }, // 100%
      { openId: 'B', games: 2, wins: 2 }, // 100%（与 A 完全并列）
      { openId: 'C', games: 2, wins: 1 }, // 50%
      { openId: 'D', games: 4, wins: 2 }, // 50%，场次更多 → 优于 C
      { openId: 'E', games: 3, wins: 0 }  // 0%
    ];
    const R = (id) => GameModel._computeWinRateRank(list, id);
    expect(R('A')).toBe(1);
    expect(R('B')).toBe(1);        // 胜率与场次都相同 → 并列同名次
    expect(R('D')).toBe(3);        // 同为 50%，场次多者靠前
    expect(R('C')).toBe(4);
    expect(R('E')).toBe(5);
    expect(R('ZZZ')).toBeNull();   // 不在榜
  });

  it('13-4 机器人房(000000)对局不计入统计与排名', async () => {
    const g = await createRoomAndStartGame(5);
    await db.query(`UPDATE games SET game_result = ?, room_number = '000000' WHERE id = ?`, ['{"winner":"good"}', g.gameId]);
    await endGame(g.gameId);

    const p = g.players[0];
    const res = await apiGet(`/api/games/stats?subjectOpenId=${p.openId}&viewerOpenId=${p.openId}`);
    expect(res.body.stats.totalGames).toBe(0);
    expect(res.body.stats.rank).toBeNull();
  });

  it('13-5 批量接口：字段/排序/隐私/000000排除', async () => {
    const day = Date.now();
    const visibleId = `test_batch_v_${day}`;
    const hiddenId = `test_batch_h_${day}`;
    const botId = `test_batch_b_${day}`;
    const tag = day.toString(36);

    // 可见玩家：55 局全胜（> 阈值上限 50，确保必在榜）
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 1) ON DUPLICATE KEY UPDATE public_winrate = 1', [visibleId]);
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 0) ON DUPLICATE KEY UPDATE public_winrate = 0', [hiddenId]);
    for (let i = 0; i < 55; i++) {
      const gid = `bt${tag}v${i}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
         VALUES (?, NULL, '111111', ?, 'gameEnd', 'ended', ?, NOW())`,
        [gid, visibleId, JSON.stringify({ winner: 'good' })]
      );
      await db.query(
        `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
         VALUES (?, ?, 'loyal', 'good', 'V', 1)`,
        [gid, visibleId]
      );
    }
    // 未公开玩家：1 局，但 public_winrate=0
    await db.query(
      `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
       VALUES (?, NULL, '111111', ?, 'gameEnd', 'ended', ?, NOW())`,
      [`bt${tag}h0`, hiddenId, JSON.stringify({ winner: 'good' })]
    );
    await db.query(
      `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
       VALUES (?, ?, 'loyal', 'good', 'H', 1)`,
      [`bt${tag}h0`, hiddenId]
    );
    // 机器人房 000000：不计入统计
    await db.query(
      `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
       VALUES (?, NULL, '000000', ?, 'gameEnd', 'ended', ?, NOW())`,
      [`bt${tag}b0`, botId, JSON.stringify({ winner: 'good' })]
    );
    await db.query(
      `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
       VALUES (?, ?, 'loyal', 'good', 'B', 1)`,
      [`bt${tag}b0`, botId]
    );

    const res = await apiGet(`/api/games/stats/batch?openIds=${visibleId},${hiddenId},${botId}&viewerOpenId=${visibleId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const list = res.body.players;
    expect(list.length).toBe(3);
    const byId = Object.fromEntries(list.map(p => [p.openId, p]));

    for (const k of ['totalGames', 'totalWins', 'totalWinRate', 'goodGames', 'goodWins', 'goodWinRate', 'evilGames', 'evilWins', 'evilWinRate', 'rank', 'rateVisible', 'publicWinrate', 'threshold']) {
      expect(byId[visibleId]).toHaveProperty(k);
    }
    expect(byId[visibleId].totalGames).toBe(55);
    expect(byId[visibleId].totalWins).toBe(55);
    expect(byId[visibleId].totalWinRate).toBe(100);
    expect(byId[visibleId].goodGames).toBe(55);
    expect(byId[visibleId].goodWinRate).toBe(100);
    expect(byId[visibleId].evilGames).toBe(0);
    expect(byId[visibleId].rateVisible).toBe(true);
    expect(typeof byId[visibleId].rank).toBe('number');
    expect(byId[visibleId].rank).toBeGreaterThanOrEqual(1);

    expect(byId[hiddenId].rateVisible).toBe(false);
    expect(byId[hiddenId].rank).toBeNull();
    expect(byId[hiddenId].totalGames).toBe(1);

    expect(byId[botId].totalGames).toBe(0);

    // 排序：可见者在前
    expect(list[0].openId).toBe(visibleId);
    expect(list.findIndex(p => p.openId === visibleId)).toBeLessThan(list.findIndex(p => p.openId === hiddenId));
  });

  it('13-6 批量接口：无 openIds 返回空数组', async () => {
    const res = await apiGet('/api/games/stats/batch');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, players: [] });
  });

  // 拉取排行榜全量（分页拼接）
  async function fetchLeaderboardAll(pageSize = 50) {
    const all = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await apiGet(`/api/games/stats/leaderboard?page=${page}&pageSize=${pageSize}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      all.push(...res.body.players);
      totalPages = res.body.totalPages;
      page++;
    } while (page <= totalPages && page <= 30);
    return all;
  }

  // 造 n 局“已结束、非000000、全胜”的对局给某 openId
  async function seedEndedWins(openId, games, roomNumber, tag) {
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 1) ON DUPLICATE KEY UPDATE public_winrate = 1', [openId]);
    for (let i = 0; i < games; i++) {
      const gid = `lb${tag}${i}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
         VALUES (?, NULL, ?, ?, 'gameEnd', 'ended', ?, NOW())`,
        [gid, roomNumber, openId, JSON.stringify({ winner: 'good' })]
      );
      await db.query(
        `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
         VALUES (?, ?, 'loyal', 'good', 'L', 1)`,
        [gid, openId]
      );
    }
  }

  it('13-7 排行榜：分页元数据 + 全量排序/并列名次一致 + isSelf/isFriend', async () => {
    const tag = Date.now().toString(36);
    const seedIds = [];
    for (let k = 0; k < 3; k++) {
      const uid = `test_lb_${tag}_${k}`;
      await seedEndedWins(uid, 55, '111111', `${tag}k${k}_`);
      seedIds.push(uid);
    }

    // 分页结构
    const p1 = await apiGet('/api/games/stats/leaderboard?page=1&pageSize=2');
    expect(p1.status).toBe(200);
    expect(p1.body.success).toBe(true);
    expect(p1.body.page).toBe(1);
    expect(p1.body.pageSize).toBe(2);
    expect(Array.isArray(p1.body.players)).toBe(true);
    expect(p1.body.players.length).toBeLessThanOrEqual(2);
    expect(p1.body.totalPages).toBe(Math.max(1, Math.ceil(p1.body.total / 2)));

    // 越界/负数夹取
    const far = await apiGet('/api/games/stats/leaderboard?page=9999&pageSize=2');
    expect(far.body.page).toBe(far.body.totalPages);
    const neg = await apiGet('/api/games/stats/leaderboard?page=-3&pageSize=2');
    expect(neg.body.page).toBe(1);

    // 全量：排序 + 并列名次
    const all = await fetchLeaderboardAll(50);
    expect(all.length).toBe(p1.body.total);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1];
      const b = all[i];
      const diff = b.wins * a.games - a.wins * b.games; // >0 → b 胜率更高（不应发生）
      expect(diff).toBeLessThanOrEqual(0);
      if (diff === 0) expect(b.games).toBeLessThanOrEqual(a.games);
      const sameRate = (b.wins * a.games === a.wins * b.games);
      if (sameRate && b.games === a.games) expect(b.rank).toBe(a.rank);
      else expect(b.rank).toBeGreaterThan(a.rank);
    }
    all.forEach(r => expect(typeof r.rank).toBe('number'));

    // 我们造的玩家都在榜
    const ids = new Set(all.map(r => r.openId));
    seedIds.forEach(id => expect(ids.has(id)).toBe(true));

    // isSelf
    const top = all[0];
    const withViewer = await apiGet(`/api/games/stats/leaderboard?page=1&pageSize=50&viewerOpenId=${top.openId}`);
    const selfRow = withViewer.body.players.find(p => p.openId === top.openId);
    expect(selfRow && selfRow.isSelf).toBe(true);

    // isFriend：top 与另一名玩家建好友关系后应标记
    const other = all[1];
    if (other && other.openId !== top.openId) {
      await db.query('INSERT IGNORE INTO friendships (user_open_id, friend_open_id) VALUES (?, ?)', [top.openId, other.openId]);
      const wv = await apiGet(`/api/games/stats/leaderboard?page=1&pageSize=50&viewerOpenId=${top.openId}`);
      const friendRow = wv.body.players.find(p => p.openId === other.openId);
      if (friendRow) expect(friendRow.isFriend).toBe(true);
    }
  });

  it('13-8 排行榜：未公开胜率 / 机器人房 000000 不计入', async () => {
    const tag = Date.now().toString(36);
    const priv = `test_lb_priv_${tag}`;
    const bot = `test_lb_bot_${tag}`;

    // 未公开：60 局全胜但 public_winrate=0
    await db.query('INSERT INTO users (open_id, public_winrate) VALUES (?, 0) ON DUPLICATE KEY UPDATE public_winrate = 0', [priv]);
    for (let i = 0; i < 60; i++) {
      const gid = `lbp${tag}${i}`;
      await db.query(
        `INSERT INTO games (id, room_id, room_number, owner_id, current_phase, status, game_result, ended_at)
         VALUES (?, NULL, '111111', ?, 'gameEnd', 'ended', ?, NOW())`,
        [gid, priv, JSON.stringify({ winner: 'good' })]
      );
      await db.query(
        `INSERT INTO game_players (game_id, open_id, role, side, nick_name, seat_number)
         VALUES (?, ?, 'loyal', 'good', 'P', 1)`,
        [gid, priv]
      );
    }

    // 机器人房：60 局、公开，但 room_number=000000
    await seedEndedWins(bot, 60, '000000', `${tag}b_`);

    const all = await fetchLeaderboardAll(50);
    const ids = new Set(all.map(r => r.openId));
    expect(ids.has(priv)).toBe(false);
    expect(ids.has(bot)).toBe(false);
  });
});
