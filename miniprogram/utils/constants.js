// 游戏常量定义

// 人数范围
const PLAYER_COUNTS = {
  MIN: 5,
  MAX: 12
};

// 座位号范围
const SEAT_NUMBER_RANGE = {
  MIN: 1,
  MAX: 12
};

// 角色定义
const ROLES = {
  MERLIN: 'merlin',
  PERCIVAL: 'percival',
  LOYAL: 'loyal',
  MORDRED: 'mordred',
  MORGANA: 'morgana',
  ASSASSIN: 'assassin',
  MINION: 'minion',
  OBERON: 'oberon',
  LANCELOT_BLUE: 'lancelotBlue',
  LANCELOT_RED: 'lancelotRed'
};

// 阵营
const SIDES = {
  GOOD: 'good',
  EVIL: 'evil'
};

// 游戏阶段
const GAME_PHASES = {
  WAITING: 'waiting',
  ROLE_REVEAL: 'roleReveal',
  DISCUSSION: 'discussion',
  TEAM_VOTE: 'teamVote',
  MISSION_VOTE: 'missionVote',
  MISSION_RESULT: 'missionResult',
  GAME_END: 'gameEnd'
};

// 角色分配推荐配置（玩家人数 -> 角色数组）
const ROLE_CONFIGS = {
  5:  [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN],
  6:  [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN],
  7:  [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.OBERON],
  8:  [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION],
  9:  [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MORDRED],
  10: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MORDRED, ROLES.OBERON],
  11: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.MORDRED, ROLES.OBERON, ROLES.LANCELOT_BLUE, ROLES.LANCELOT_RED],
  12: [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.LOYAL, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MORDRED, ROLES.OBERON, ROLES.LANCELOT_BLUE, ROLES.LANCELOT_RED]
};

// 任务队伍人数配置（玩家人数 -> [第1轮, 第2轮, 第3轮, 第4轮, 第5轮]）
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [3, 4, 5, 6, 6],
  12: [3, 4, 5, 6, 6]
};

// 角色中文名称
const ROLE_NAMES = {
  [ROLES.MERLIN]: '梅林',
  [ROLES.PERCIVAL]: '派西维尔',
  [ROLES.LOYAL]: '忠臣',
  [ROLES.MORDRED]: '莫德雷德',
  [ROLES.MORGANA]: '莫甘娜',
  [ROLES.ASSASSIN]: '刺客',
  [ROLES.MINION]: '爪牙',
  [ROLES.OBERON]: '奥伯伦',
  [ROLES.LANCELOT_BLUE]: '蓝兰斯洛特',
  [ROLES.LANCELOT_RED]: '红兰斯洛特'
};

// 角色描述
const ROLE_DESCRIPTIONS = {
  [ROLES.MERLIN]: '知道所有红方（除莫德雷德），需要隐藏身份',
  [ROLES.PERCIVAL]: '知道梅林和莫甘娜，需要保护梅林',
  [ROLES.LOYAL]: '蓝方阵营，不知道其他角色身份',
  [ROLES.MORDRED]: '红方，梅林看不到他',
  [ROLES.MORGANA]: '红方，假扮梅林迷惑派西维尔',
  [ROLES.ASSASSIN]: '红方，游戏结束时可以刺杀梅林',
  [ROLES.MINION]: '红方，帮助破坏任务',
  [ROLES.OBERON]: '红方，不知道其他红方身份，红方看不到他',
  [ROLES.LANCELOT_BLUE]: '蓝方阵营的兰斯洛特，与红兰斯洛特成对出现',
  [ROLES.LANCELOT_RED]: '红方阵营的兰斯洛特，与蓝兰斯洛特成对出现'
};

// 工具函数
function getRoleSide(role) {
  const goodRoles = [ROLES.MERLIN, ROLES.PERCIVAL, ROLES.LOYAL, ROLES.LANCELOT_BLUE];
  const evilRoles = [ROLES.MORDRED, ROLES.MORGANA, ROLES.ASSASSIN, ROLES.MINION, ROLES.OBERON, ROLES.LANCELOT_RED];
  if (goodRoles.includes(role)) return SIDES.GOOD;
  if (evilRoles.includes(role)) return SIDES.EVIL;
  return SIDES.GOOD;
}

function getRoleName(role) {
  return ROLE_NAMES[role] || '未知';
}

function getRoleDescription(role) {
  return ROLE_DESCRIPTIONS[role] || '角色信息错误';
}

// ── 配置弹窗共享常量（index 创建房间 / room 配置房间 / configs 组件 共用） ──
const CONFIG_GOOD_ROLES = ['merlin', 'percival', 'lancelotBlue'];
const CONFIG_EVIL_ROLES = ['morgana', 'assassin', 'mordred', 'minion', 'oberon', 'lancelotRed'];
const CONFIG_FORCED_ROLES = ['merlin', 'percival', 'morgana'];

// 配置弹窗角色短名（派西/蓝兰/红兰）
const ROLE_NAMES_SHORT = {
  merlin: '梅林', percival: '派西', loyal: '忠臣',
  lancelotBlue: '蓝兰', lancelotRed: '红兰',
  morgana: '莫甘娜', assassin: '刺客', mordred: '莫德雷德',
  minion: '爪牙', oberon: '奥伯伦'
};

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

const SPEECH_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒', '150秒', '180秒'];
const ROUND_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒'];
const VOTE_OPTIONS = ['不限', '15秒', '30秒', '45秒', '60秒'];
const VOTE_REVEAL_OPTIONS = ['3秒', '5秒', '8秒', '10秒'];

const DEFAULT_AVATAR = '/images/default-avatar.png';

// 默认规则（含兰斯洛特卡组：转换卡/不转换卡）
function buildDefaultRule() {
  return {
    evilKnowsEachOther: true, lancelotsKnowEachOther: false, lancelotSwapRound: 2,
    ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
    oberonMustFailMission: false, lancelotMustFail: false,
    voteVisibility: 'public', missionFailDetail: 'count',
    evilsKnowRedLancelot: true, oberonKnowsRedLancelot: true, merlinKnowsLancelotSide: true,
    lancelotSwitchCards: 2, lancelotKeepCards: 5
  };
}

module.exports = {
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
  getRoleDescription,
  CONFIG_GOOD_ROLES,
  CONFIG_EVIL_ROLES,
  CONFIG_FORCED_ROLES,
  ROLE_NAMES_SHORT,
  DEFAULT_CONFIGS,
  SPEECH_OPTIONS,
  ROUND_OPTIONS,
  VOTE_OPTIONS,
  VOTE_REVEAL_OPTIONS,
  DEFAULT_AVATAR,
  buildDefaultRule
};
