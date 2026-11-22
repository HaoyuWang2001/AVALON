// utils/scoring.js —— 计分纯函数（无 DB 依赖，便于单测与证明）
//
// 计分模型（两位小数）：
//   Base(n) = clamp(0.80 - 0.05*(n-5), 0.45, 0.80)              —— 人数越少基础分越高
//   p_s(n)  = clamp(Laplace((wins+1)/(games+2)), 0.35, 0.65)     —— 该人数下阵营历史胜率
//   A_s     = 0.45 * (0.5 / p_s)                                 —— 胜分：强阵营加分更少
//   L_s     = 0.30 * (p_s / 0.5)                                 —— 败分：强阵营扣分更多
//   角色分   = 仅胜方：ω_r - mean(ω)，ω_r = clamp(0.5 - roleWinRate, 0, 0.15)
//   荣誉分   = (MVP票数 + SVP票数) * 0.01
//
// 平衡定理（数学恒等）：E_s = Base + 0.5*0.45 - 2*0.30*p_s*(1-p_s)
//   因 p_good(1-p_good) = p_evil(1-p_evil)，两侧期望严格相等（忽略两位小数舍入 ≤0.02）。
// 非负性：胜方 ≥ 0.45+0.35-0.15 = 0.65；败方 ≥ 0.45-0.39 = 0.06；荣誉分 ≥ 0。

const BASE_INTERCEPT = 0.80;
const BASE_STEP = 0.05;
const BASE_MIN = 0.45;
const BASE_MAX = 0.80;
const WIN_COEF = 0.45;
const LOSS_COEF = 0.30;
const P_MIN = 0.35;
const P_MAX = 0.65;
const ROLE_WEIGHT_MAX = 0.15;
const ROLE_WEIGHT_PIVOT = 0.5;
const AWARD_PER_VOTE = 0.01;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

function baseScore(n) {
  const count = Number(n) || 0;
  return round2(clamp(BASE_INTERCEPT - BASE_STEP * (count - 5), BASE_MIN, BASE_MAX));
}

// Laplace 平滑胜率（0 场 = 0.5）
function smoothedRate(wins, games) {
  return clamp(((Number(wins) || 0) + 1) / ((Number(games) || 0) + 2), 0, 1);
}

function factionProb(side, n, factionStats) {
  const byN = (factionStats || {})[Number(n)] || {};
  const row = byN[side] || { wins: 0, games: 0 };
  return clamp(smoothedRate(row.wins, row.games), P_MIN, P_MAX);
}

function winScore(p) {
  return round2(WIN_COEF * (0.5 / clamp(Number(p) || 0.5, P_MIN, P_MAX)));
}

function lossScore(p) {
  return round2(LOSS_COEF * (clamp(Number(p) || 0.5, P_MIN, P_MAX) / 0.5));
}

function roleWeight(role, roleStats) {
  const row = (roleStats || {})[role] || { wins: 0, games: 0 };
  const rate = smoothedRate(row.wins, row.games);
  return clamp(ROLE_WEIGHT_PIVOT - rate, 0, ROLE_WEIGHT_MAX);
}

/**
 * 计算单局所有玩家的得分明细（两位小数，保证非负）
 * @param {Object} opts
 * @param {number} opts.n 人数
 * @param {'good'|'evil'} opts.winner 胜方
 * @param {Array<{openId, side, role}>} opts.players
 * @param {Object} opts.factionStats 按人数分层的阵营战绩
 * @param {Object} opts.roleStats 角色战绩
 * @param {Object} [opts.mvpVotes] openId -> 票数
 * @param {Object} [opts.svpVotes] openId -> 票数
 */
function scoreGame(opts) {
  const { n, winner, players, factionStats, roleStats, mvpVotes, svpVotes } = opts;
  const list = players || [];
  const winSide = winner;
  const loseSide = winner === 'good' ? 'evil' : 'good';
  const winners = list.filter(p => p.side === winSide);

  const base = baseScore(n);
  const pWin = factionProb(winSide, n, factionStats);
  const pLose = factionProb(loseSide, n, factionStats);
  const A = winScore(pWin);
  const L = lossScore(pLose);

  const weights = winners.map(p => roleWeight(p.role, roleStats));
  const meanW = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;

  const mvp = mvpVotes || {};
  const svp = svpVotes || {};

  return list.map(p => {
    let winPart = 0;
    let rolePart = 0;
    if (p.side === winSide) {
      winPart = A;
      rolePart = roleWeight(p.role, roleStats) - meanW; // 胜方内部零和再分配
    } else {
      winPart = -L;
      rolePart = 0;
    }
    const votes = (Number(mvp[p.openId]) || 0) + (Number(svp[p.openId]) || 0);
    const awardPart = votes * AWARD_PER_VOTE;
    const rawTotal = base + winPart + rolePart + awardPart;
    return {
      openId: p.openId,
      side: p.side,
      role: p.role,
      base: round2(base),
      winScore: round2(winPart),
      roleScore: round2(rolePart),
      awardScore: round2(awardPart),
      total: Math.max(0, round2(rawTotal))
    };
  });
}

module.exports = {
  baseScore,
  smoothedRate,
  factionProb,
  winScore,
  lossScore,
  roleWeight,
  scoreGame,
  round2,
  AWARD_PER_VOTE
};
