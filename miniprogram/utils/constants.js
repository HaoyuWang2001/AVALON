// 游戏常量定义

// 人数范围
export const PLAYER_COUNTS = {
  MIN: 5,
  MAX: 12
};

// 座位号范围
export const SEAT_NUMBER_RANGE = {
  MIN: 1,
  MAX: 12
};

// 角色定义
export const ROLES = {
  MERLIN: 'merlin',
  PERCIVAL: 'percival',
  LOYAL: 'loyal',
  MORDRED: 'mordred',
  MORGANA: 'morgana',
  ASSASSIN: 'assassin',
  MINION: 'minion',
  OBERON: 'oberon',
  LANCELOT: 'lancelot',
  LADY_OF_THE_LAKE: 'ladyOfTheLake'
};

// 阵营
export const SIDES = {
  GOOD: 'good',
  EVIL: 'evil'
};

// 游戏阶段
export const GAME_PHASES = {
  WAITING: 'waiting',
  ROLE_REVEAL: 'roleReveal',
  TEAM_SELECTION: 'teamSelection',
  TEAM_VOTE: 'teamVote',
  MISSION_VOTE: 'missionVote',
  MISSION_RESULT: 'missionResult',
  GAME_END: 'gameEnd'
};

// 角色分配配置（玩家人数 -> 角色数组）
export const ROLE_CONFIGS = {
  5: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.ASSASSIN],
  6: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.ASSASSIN],
  7: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN],
  8: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN],
  9: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN],
  10: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION],
  11: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION, ROLES.LANCELOT],
  12: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION, ROLES.OBERON, ROLES.LANCELOT]
};

// 任务队伍人数配置（玩家人数 -> [第1轮, 第2轮, 第3轮, 第4轮, 第5轮]）
export const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [3, 4, 4, 5, 5],
  12: [4, 5, 5, 6, 6]
};

// 角色中文名称
export const ROLE_NAMES = {
  [ROLES.MERLIN]: '梅林',
  [ROLES.PERCIVAL]: '派西维尔',
  [ROLES.LOYAL]: '忠臣',
  [ROLES.MORDRED]: '莫德雷德',
  [ROLES.MORGANA]: '莫甘娜',
  [ROLES.ASSASSIN]: '刺客',
  [ROLES.MINION]: '爪牙',
  [ROLES.OBERON]: '奥伯伦',
  [ROLES.LANCELOT]: '兰斯洛特',
  [ROLES.LADY_OF_THE_LAKE]: '湖中仙女'
};

// 角色描述
export const ROLE_DESCRIPTIONS = {
  [ROLES.MERLIN]: '知道所有坏人（除莫德雷德），需要隐藏身份',
  [ROLES.PERCIVAL]: '知道梅林和莫甘娜，需要保护梅林',
  [ROLES.LOYAL]: '好人阵营，不知道其他角色身份',
  [ROLES.MORDRED]: '坏人，梅林看不到他',
  [ROLES.MORGANA]: '坏人，假扮梅林迷惑派西维尔',
  [ROLES.ASSASSIN]: '坏人，游戏结束时可以刺杀梅林',
  [ROLES.MINION]: '坏人，帮助破坏任务',
  [ROLES.OBERON]: '坏人，不知道其他坏人身份，坏人看不到他',
  [ROLES.LANCELOT]: '好人或坏人身份不确定，任务投票时可以故意输掉',
  [ROLES.LADY_OF_THE_LAKE]: '好人，可以使用湖中仙女技能查看其他玩家阵营'
};

// 工具函数
export function getRoleSide(role) {
  const goodRoles = [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LANCELOT, ROLES.LADY_OF_THE_LAKE];
  const evilRoles = [ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION, ROLES.OBERON];
  if (goodRoles.includes(role)) return SIDES.GOOD;
  if (evilRoles.includes(role)) return SIDES.EVIL;
  return SIDES.GOOD;
}

export function getRoleName(role) {
  return ROLE_NAMES[role] || '未知';
}

export function getRoleDescription(role) {
  return ROLE_DESCRIPTIONS[role] || '角色信息错误';
}

export default {
  PLAYER_COUNTS,
  SEAT_NUMBER_RANGE,
  ROLES,
  SIDES,
  GAME_PHASES,
  ROLE_CONFIGS,
  TEAM_SIZES,
  ROLE_NAMES,
  ROLE_DESCRIPTIONS,
  getRoleSide,
  getRoleName,
  getRoleDescription
};
