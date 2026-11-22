// utils/roomTags.js —— 房间展示标签（仅村规差异项，与后端 RoomModel.buildRoomTags 保持一致）
function buildRoomTags(cfg) {
  const config = cfg || {};
  const rules = config.rules || {};
  const roles = config.roles || {};
  const all = [...(roles.good || []), ...(roles.evil || [])];
  const tags = [];
  if (rules.ladyOfTheLake) tags.push('湖仙');
  if (rules.voteVisibility === 'anonymous') tags.push('匿名投票');
  if (typeof rules.maxFailedNominations === 'number' && rules.maxFailedNominations !== 3) {
    tags.push('强制开车·' + rules.maxFailedNominations + '轮');
  }
  if (rules.missionFailDetail === 'binary') tags.push('失败仅成败');
  if (all.includes('oberon')) tags.push('奥伯伦');
  const hasBlue = all.includes('lancelotBlue');
  const hasRed = all.includes('lancelotRed');
  if (hasBlue && hasRed) tags.push('双兰');
  else if (hasRed) tags.push('红兰');
  else if (hasBlue) tags.push('蓝兰');
  if (typeof rules.lancelotSwapRound === 'number' && rules.lancelotSwapRound !== 2) {
    tags.push('换身·第' + rules.lancelotSwapRound + '轮');
  }
  if (rules.lancelotMustFail) tags.push('兰斯必败');
  if (rules.oberonMustFailMission) tags.push('奥伯伦必败');
  if (rules.evilKnowsEachOther === false) tags.push('红方不互知');
  return tags;
}

module.exports = { buildRoomTags };
