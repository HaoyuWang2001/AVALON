// utils/scoring.js —— 计分纯函数（无 DB 依赖，便于单测与证明）
//
// 计分模型（两位小数）：
//   基础分 Base(n)：按人数查表（人数越少基础分越低）
//     { 5:0.20, 6:0.25, 7:0.30, 8:0.35, 9:0.45, 10:0.50, 11:0.50, 12:0.50 }
//   阵营胜率 p_s(n) = clamp(Laplace((wins+1)/(games+2)), 0.35, 0.65)
//   胜分 A = 0.45 × (0.5/p) × WIN_SIZE[n]     —— 人数越多、胜利奖励越高
//   败分 L = 0.30 × (p/0.5) × LOSS_SIZE[n]     —— 失败扣分随人数仅极温和变化
//   角色分 = 仅胜方：ω_r − mean(ω)，ω_r = clamp(0.5 - roleWinRate, 0, 0.15)
//   荣誉分 = (MVP票数 + SVP票数) * 0.01
//   单局：胜 = Base + A + 角色分 + 荣誉分；负 = Base − L + 荣誉分
//   单局允许为负（小人数局败场可能倒扣）；累计总分在下游读取时做 GREATEST(SUM,0) 保底
//
// 平衡定理（数学恒等）：E_s = Base + 0.225·WIN_SIZE[n] − 0.6·p_s·(1−p_s)·LOSS_SIZE[n]
//   因 WIN_SIZE/LOSS_SIZE 只与人数 n 有关、且 p_good(1−p_good)=p_evil(1−p_evil)，
//   两侧期望严格相等（忽略两位小数舍入 ≤0.02）。

const BASE_BY_N = { 5: 0.20, 6: 0.25, 7: 0.30, 8: 0.35, 9: 0.45, 10: 0.50, 11: 0.50, 12: 0.50 };
const WIN_SIZE  = { 5: 0.75, 6: 0.80, 7: 0.85, 8: 1.00, 9: 1.10, 10: 1.25, 11: 1.40, 12: 1.55 };
const LOSS_SIZE = { 5: 0.95, 6: 0.97, 7: 0.99, 8: 1.00, 9: 1.01, 10: 1.03, 11: 1.04, 12: 1.05 };

const WIN_COEF = 0.45;
const LOSS_COEF = 0.30;
const P_MIN = 0.35;
const P_MAX = 0.65;
const ROLE_WEIGHT_MAX = 0.15;
const ROLE_WEIGHT_PIVOT = 0.5;
const AWARD_PER_VOTE = 0.01;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const byN = (table, n) => {
  const count = Number(n) || 5;
  if (count <= 5) return table[5];
  if (count >= 12) return table[12];
  return table[count] != null ? table[count] : table[5];
};

function baseScore(n) {
  return byN(BASE_BY_N, n);
}

// Laplace 平滑胜率（0 场 = 0.5）
function smoothedRate(wins, games) {
  return clamp(((Number(wins) || 0) + 1) / ((Number(games) || 0) + 2), 0, 1);
}

function factionProb(side, n, factionStats) {
  const byCount = (factionStats || {})[Number(n)] || {};
  const row = byCount[side] || { wins: 0, games: 0 };
  return clamp(smoothedRate(row.wins, row.games), P_MIN, P_MAX);
}

function winScore(p, n) {
  return round2(WIN_COEF * (0.5 / clamp(Number(p) || 0.5, P_MIN, P_MAX)) * byN(WIN_SIZE, n));
}

function lossScore(p, n) {
  return round2(LOSS_COEF * (clamp(Number(p) || 0.5, P_MIN, P_MAX) / 0.5) * byN(LOSS_SIZE, n));
}

function roleWeight(role, roleStats) {
  const row = (roleStats || {})[role] || { wins: 0, games: 0 };
  const rate = smoothedRate(row.wins, row.games);
  return clamp(ROLE_WEIGHT_PIVOT - rate, 0, ROLE_WEIGHT_MAX);
}

/**
 * 计算单局所有玩家的得分明细（两位小数；允许负分）
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
  const A = winScore(pWin, n);
  const L = lossScore(pLose, n);

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
    return {
      openId: p.openId,
      side: p.side,
      role: p.role,
      base: round2(base),
      winScore: round2(winPart),
      roleScore: round2(rolePart),
      awardScore: round2(awardPart),
      total: round2(base + winPart + rolePart + awardPart)
    };
  });
}

module.exports = {
  BASE_BY_N,
  WIN_SIZE,
  LOSS_SIZE,
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
