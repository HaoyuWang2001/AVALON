// 只读版型摘要：生成分组配置文本，文案与顺序对齐 components/configs/configs.wxml
const { ROLE_NAMES_SHORT } = require('./constants.js');

function buildConfigSummary(cfg) {
  const good = (cfg.roles && cfg.roles.good) || [];
  const evil = (cfg.roles && cfg.roles.evil) || [];
  const roleCount = {};
  const countRoles = list => {
    list.forEach(r => { roleCount[r] = (roleCount[r] || 0) + 1; });
  };
  countRoles(good);
  countRoles(evil);
  const roleStr = roleList => {
    const uniq = [...new Set(roleList)];
    return uniq.map(r => {
      const n = roleCount[r] || 1;
      return ROLE_NAMES_SHORT[r] || r + (n > 1 ? '×' + n : '');
    }).join('、');
  };
  const all = [...good, ...evil];
  const hasOberon = all.includes('oberon');
  const hasLancelot = all.includes('lancelotBlue') || all.includes('lancelotRed');
  const hasLancelotRed = all.includes('lancelotRed');
  const hasBothLancelots = all.includes('lancelotBlue') && all.includes('lancelotRed');
  const rules = cfg.rules || {};
  const limits = cfg.limits || {};

  const groups = [];
  // 湖中仙女（向导 page 0，置于最前）
  if (rules.ladyOfTheLake) {
    const lakeRound = rules.ladyOfTheLakeRound || 1;
    groups.push({
      title: '湖中仙女',
      lines: [
        '启用湖中仙女：开',
        '生效轮次：第' + lakeRound + '轮发车成功、第' + (lakeRound + 1) + '轮开始时'
      ]
    });
  }
  // 基础规则（向导 page 1）
  groups.push({
    title: '基础规则',
    lines: [
      '红方互知身份：' + (rules.evilKnowsEachOther ? '开' : '关'),
      '流车上限：' + (rules.maxFailedNominations != null ? rules.maxFailedNominations : 3) + ' 次',
      '票型公开：' + (rules.voteVisibility === 'anonymous' ? '匿名' : '公开'),
      '失败详情：' + (rules.missionFailDetail === 'binary' ? '成败' : '票数')
    ]
  });
  // 红方强制任务失败（含奥伯伦或兰斯时）
  const failLines = [];
  if (hasOberon) failLines.push('奥伯伦必须任务失败：' + (rules.oberonMustFailMission ? '开' : '关'));
  if (hasLancelot) failLines.push('兰斯洛特必须任务失败：' + (rules.lancelotMustFail ? '开' : '关'));
  if (failLines.length) groups.push({ title: '红方强制任务失败', lines: failLines });
  // 兰斯洛特配置（含任意兰斯时）
  if (hasLancelot) {
    const lancLines = [];
    if (hasBothLancelots) lancLines.push('兰斯互认身份：' + (rules.lancelotsKnowEachOther ? '开' : '关'));
    if (rules.lancelotSwapRound != null && rules.lancelotSwapRound > 0) {
      lancLines.push('兰斯换身轮次：第' + rules.lancelotSwapRound + '轮发车成功、第' + (rules.lancelotSwapRound + 1) + '轮开始时');
    }
    lancLines.push('转换卡数量：' + (rules.lancelotSwitchCards != null ? rules.lancelotSwitchCards : 2) + ' 张');
    lancLines.push('不转换卡数量：' + (rules.lancelotKeepCards != null ? rules.lancelotKeepCards : 5) + ' 张');
    if (hasLancelotRed) lancLines.push('睁眼狼知红兰：' + (rules.evilsKnowRedLancelot ? '开' : '关'));
    if (hasOberon && hasLancelotRed) lancLines.push('奥伯伦知红兰：' + (rules.oberonKnowsRedLancelot ? '开' : '关'));
    if (hasBothLancelots) lancLines.push('梅林辨兰阵营：' + (rules.merlinKnowsLancelotSide ? '开' : '关'));
    groups.push({ title: '兰斯洛特配置', lines: lancLines });
  }
  // 时间限制（向导 page 4，先于观战设置）
  const f = v => v ? v + 's' : '无限制';
  const limitLines = ['发言限时：' + f(limits.speechTimeout), '任务超时：' + f(limits.roundTimeout), '投票超时：' + f(limits.voteTimeout)];
  if (limits.voteRevealDuration) limitLines.push('票型展示时长：' + limits.voteRevealDuration + 's');
  groups.push({ title: '时间限制', lines: limitLines });
  // 观战设置（向导 page 4，后于时间限制）
  const spec = cfg.spectator || {};
  groups.push({
    title: '观战设置',
    lines: [
      '允许观战：' + (spec.allow !== false ? '开' : '关'),
      '观战人数上限：' + (spec.max > 0 ? spec.max : '不限')
    ]
  });

  return {
    playerCount: good.length + evil.length,
    goodRoles: roleStr(good),
    evilRoles: roleStr(evil),
    groups
  };
}

module.exports = { buildConfigSummary };
