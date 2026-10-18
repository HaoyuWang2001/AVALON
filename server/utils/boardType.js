/**
 * 板型分类器（与前端 utils/constants.js 的 classifyBoard 保持同一套定义）。
 *
 * 判定顺序：expert → noPercival → standard → custom
 *  - expert:     8人 + 专家角色（梅林/派西 + 莫甘娜/刺客/莫德雷德）+ 湖仙开 + 流车上限4 + 红方互知关
 *  - noPercival: 6人 + 梅林单蓝 + 莫甘娜/刺客双红
 *  - standard:   角色与该人数默认板完全一致（规则改动不降级）
 *  - custom:     其余全部
 *
 * 历史回填例外（backfill_board_type.js）：8人且红方含莫德雷德一律按 expert 处理
 * （旧专家局默认红方互知为开，属历史配置错误，回填时同步修正快照）。
 */

const BOARD_TYPES = { STANDARD: 'standard', EXPERT: 'expert', NO_PERCIVAL: 'noPercival', CUSTOM: 'custom' };

const EXPERT_CONFIG = {
  playerCount: 8,
  good: ['merlin', 'percival'],
  evil: ['morgana', 'assassin', 'mordred'],
  ladyOfTheLake: true,
  maxFailedNominations: 4,
  evilKnowsEachOther: false
};

const NO_PERCIVAL_CONFIG = {
  playerCount: 6,
  good: ['merlin'],
  evil: ['morgana', 'assassin']
};

// 各人数默认板（特殊角色，不含 loyal；与前端 DEFAULT_CONFIGS 一致）
const DEFAULT_CONFIGS = {
  5:  { good: ['merlin', 'percival'], evil: ['morgana', 'assassin'] },
  6:  { good: ['merlin', 'percival'], evil: ['morgana', 'assassin'] },
  7:  { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'oberon'] },
  8:  { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'minion'] },
  9:  { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'mordred'] },
  10: { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'mordred', 'oberon'] },
  11: { good: ['merlin', 'percival'], evil: ['morgana', 'mordred', 'oberon', 'lancelotBlue', 'lancelotRed'] },
  12: { good: ['merlin', 'percival'], evil: ['morgana', 'assassin', 'mordred', 'oberon', 'lancelotBlue', 'lancelotRed'] }
};

// roles 可能带 loyal（完整形态）也可能不带：统一滤掉 loyal 后排序比较
function specialRoles(list) {
  return [...((list || []).filter(r => r !== 'loyal'))].sort().join(',');
}

function isExpertBoard(roles, rules, playerCount) {
  if (playerCount !== EXPERT_CONFIG.playerCount) return false;
  const good = specialRoles(roles && roles.good);
  const evil = specialRoles(roles && roles.evil);
  return good === specialRoles(EXPERT_CONFIG.good) && evil === specialRoles(EXPERT_CONFIG.evil)
    && !!rules && rules.ladyOfTheLake === true
    && rules.maxFailedNominations === EXPERT_CONFIG.maxFailedNominations
    && rules.evilKnowsEachOther === false;
}

function isNoPercivalBoard(roles, playerCount) {
  if (playerCount !== NO_PERCIVAL_CONFIG.playerCount) return false;
  return specialRoles(roles && roles.good) === specialRoles(NO_PERCIVAL_CONFIG.good)
    && specialRoles(roles && roles.evil) === specialRoles(NO_PERCIVAL_CONFIG.evil);
}

function isStandardBoard(roles, playerCount) {
  const def = DEFAULT_CONFIGS[playerCount];
  if (!def) return false;
  return specialRoles(roles && roles.good) === specialRoles(def.good)
    && specialRoles(roles && roles.evil) === specialRoles(def.evil);
}

function classifyBoard(roles, rules, playerCount) {
  if (isExpertBoard(roles, rules, playerCount)) return BOARD_TYPES.EXPERT;
  if (isNoPercivalBoard(roles, playerCount)) return BOARD_TYPES.NO_PERCIVAL;
  if (isStandardBoard(roles, playerCount)) return BOARD_TYPES.STANDARD;
  return BOARD_TYPES.CUSTOM;
}

module.exports = {
  BOARD_TYPES,
  EXPERT_CONFIG,
  NO_PERCIVAL_CONFIG,
  DEFAULT_CONFIGS,
  specialRoles,
  isExpertBoard,
  isNoPercivalBoard,
  isStandardBoard,
  classifyBoard
};
