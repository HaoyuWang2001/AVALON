// 游戏逻辑工具函数

// 计算任务所需队伍人数
export function getTeamSize(playerCount, round) {
  const teamSizes = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
  };
  const sizes = teamSizes[playerCount] || teamSizes[5];
  return sizes[round - 1] || sizes[0];
}

// 检查任务是否成功
export function isMissionSuccess(missionVotes, playerCount, round) {
  const votes = Object.values(missionVotes || {});
  if (votes.length === 0) return false;

  const failVotes = votes.filter(vote => vote === 'fail').length;

  // 第4回合（7人及以上）需要2个失败票才失败
  if (playerCount >= 7 && round === 4) {
    return failVotes < 2;
  }

  return failVotes === 0;
}

// 检查游戏是否结束
export function isGameOver(missionResults, assassinSuccess) {
  const successfulMissions = missionResults.filter(r => r.success).length;

  // 好人胜利条件：3个任务成功
  if (successfulMissions >= 3) {
    return { over: true, winner: 'good', reason: '完成任务' };
  }

  // 坏人胜利条件：3个任务失败
  const failedMissions = missionResults.filter(r => !r.success).length;
  if (failedMissions >= 3) {
    return { over: true, winner: 'evil', reason: '破坏任务' };
  }

  // 刺客刺杀成功
  if (assassinSuccess) {
    return { over: true, winner: 'evil', reason: '刺杀梅林' };
  }

  return { over: false };
}

// 获取角色可见信息
export function getRoleVision(playerRole, allPlayers) {
  const vision = {
    knows: [], // 知道哪些玩家身份
    appearsAs: playerRole, // 在别人眼中是什么
    specialAbility: null
  };

  switch (playerRole) {
    case 'merlin':
      // 梅林知道所有坏人（除莫德雷德）
      vision.knows = allPlayers
        .filter(p => p.side === 'evil' && p.role !== 'mordred')
        .map(p => ({ openId: p.openId, side: 'evil' }));
      break;

    case 'percival':
      // 派西维尔知道梅林和莫甘娜
      const merlin = allPlayers.find(p => p.role === 'merlin');
      const morgana = allPlayers.find(p => p.role === 'morgana');
      vision.knows = [];
      if (merlin) vision.knows.push({ openId: merlin.openId, appearsAs: 'merlin' });
      if (morgana) vision.knows.push({ openId: morgana.openId, appearsAs: 'merlin' });
      break;

    case 'morgana':
      // 莫甘娜在派西维尔眼中显示为梅林
      vision.appearsAs = 'merlin';
      break;
  }

  return vision;
}

// 分配角色
export function assignRoles(playerCount) {
  const roleConfigs = {
    5: ['merlin', 'percival', 'loyal', 'mordred', 'assassin'],
    6: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'assassin'],
    7: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    8: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    9: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
    10: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion']
  };

  const roles = roleConfigs[playerCount] || roleConfigs[5];

  // 随机打乱
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return roles;
}

// 获取角色所属阵营
export function getRoleSide(role) {
  const goodRoles = ['merlin', 'percival', 'loyal'];
  const evilRoles = ['mordred', 'morgana', 'assassin', 'minion'];

  if (goodRoles.includes(role)) return 'good';
  if (evilRoles.includes(role)) return 'evil';
  return 'unknown'; // 未知角色
}

// 获取角色名称
export function getRoleName(role) {
  const roleNames = {
    'merlin': '梅林',
    'percival': '派西维尔',
    'loyal': '忠臣',
    'mordred': '莫德雷德',
    'morgana': '莫甘娜',
    'assassin': '刺客',
    'minion': '爪牙'
  };
  return roleNames[role] || '未知';
}

export default {
  getTeamSize,
  isMissionSuccess,
  isGameOver,
  getRoleVision,
  assignRoles,
  getRoleSide,
  getRoleName
};