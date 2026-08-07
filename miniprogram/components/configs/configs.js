// components/configs/configs.js
// 配置弹窗公共组件（index 创建房间 / room 配置房间 共用）
// 无状态：每次 open() 从 properties 重新初始化（默认值或传入 roomConfig 覆盖），不保留上次修改
const api = require('../../services/api.js');
const {
  CONFIG_GOOD_ROLES, CONFIG_EVIL_ROLES, CONFIG_FORCED_ROLES,
  DEFAULT_CONFIGS, SPEECH_OPTIONS, ROUND_OPTIONS, VOTE_OPTIONS, VOTE_REVEAL_OPTIONS,
  TEAM_SIZES, buildDefaultRule
} = require('../../utils/constants.js');

Component({
  options: { addGlobalClass: true },
  properties: {
    mode: { type: String, value: 'create' },          // 'create' | 'update'
    roomId: { type: String, value: '' },              // update 模式需要
    roomConfig: { type: Object, value: null },        // null → 用默认配置
    confirmText: { type: String, value: '完成' },     // 底部按钮文案
    userInfo: { type: Object, value: null }           // 主动传入完整用户信息（create 用）
  },
  data: {
    showConfig: false,
    selectedRoles: {},
    rules: {},
    loyalCount: 0,
    goodCount: 0,
    evilCount: 0,
    playerCount: 5,
    teamSizes: [],
    roleWarning: '',
    ladyOfTheLake: false,
    ladyOfTheLakeRound: 2,
    speechTimeoutIndex: 0,
    roundTimeoutIndex: 0,
    voteTimeoutIndex: 0,
    voteRevealDurationIndex: 2,
    speechOptions: SPEECH_OPTIONS,
    roundOptions: ROUND_OPTIONS,
    voteOptions: VOTE_OPTIONS,
    voteRevealOptions: VOTE_REVEAL_OPTIONS,
    allowSpectator: true,
    spectatorLimited: false,
    maxSpectators: '',
    spectatorLimitInvalid: false,
    roomName: '',
    roomDescription: 'Welcome to Join the Conference!',
    swiperPage: 0,
    logicalPage: 0,
    visiblePages: [],
    pageCount: 0,
    goodRoleNames: '',
    evilRoleNames: '',
    summarySpeech: '',
    summarySpec: '',
    summaryLady: ''
  },
  methods: {
    // 打开弹窗：无状态——每次从 properties 重新初始化
    open() {
      // 永远进入第一个配置页
      this.setData({ logicalPage: 0, swiperPage: 0 });
      if (this.data.mode === 'update') {
        try {
          this._applyConfig(this.data.roomConfig);
        } catch (e) {
          wx.showModal({ title: '配置错误', content: '这是bug，请联系开发者', showCancel: false });
          return;
        }
      } else {
        this.applyDefaultConfig(this.data.playerCount);
        // create 模式：默认会议名（"昵称的会议"）
        if (!this.data.roomName) {
          const ui = this.data.userInfo || {};
          this.setData({ roomName: (ui.customNickName || ui.nickName || '房主') + '的会议' });
        }
      }
      this.setData({ showConfig: true, spectatorLimitInvalid: false });
    },
    // 关闭弹窗：丢弃所有修改（下次 open 重新初始化）
    close() {
      this.setData({ showConfig: false, spectatorLimitInvalid: false });
      this.triggerEvent('close');
    },
    // 从现有房间配置初始化（room 编辑模式）——必须全量传入，缺任何部分直接报错
    _applyConfig(rc) {
      const req = (cond, msg) => { if (!cond) throw new Error(msg); };
      const isNum = v => typeof v === 'number' && !isNaN(v);
      const isBool = v => typeof v === 'boolean';
      const isStr = v => typeof v === 'string' && v !== '';

      // 顶层
      req(rc && typeof rc === 'object', '配置不完整');
      // roles：非空数组
      req(rc.roles && Array.isArray(rc.roles.good) && rc.roles.good.length > 0, '蓝方角色缺失');
      req(rc.roles && Array.isArray(rc.roles.evil) && rc.roles.evil.length > 0, '红方角色缺失');
      // rules：全字段必须有值
      req(rc.rules && typeof rc.rules === 'object', '规则缺失');
      const boolRules = ['evilKnowsEachOther', 'lancelotsKnowEachOther', 'ladyOfTheLake',
        'oberonMustFailMission', 'lancelotMustFail', 'evilsKnowRedLancelot',
        'oberonKnowsRedLancelot', 'merlinKnowsLancelotSide'];
      boolRules.forEach(k => req(isBool(rc.rules[k]), '规则字段缺失：' + k));
      req(isNum(rc.rules.maxFailedNominations) && rc.rules.maxFailedNominations >= 1, '流车上限缺失');
      req(isNum(rc.rules.lancelotSwapRound) && rc.rules.lancelotSwapRound >= 1 && rc.rules.lancelotSwapRound <= 4, '换身轮次缺失');
      req(isNum(rc.rules.ladyOfTheLakeRound) && rc.rules.ladyOfTheLakeRound >= 1 && rc.rules.ladyOfTheLakeRound <= 4, '湖仙轮次缺失');
      req(isNum(rc.rules.lancelotSwitchCards) && rc.rules.lancelotSwitchCards >= 0, '转换卡数量缺失');
      req(isNum(rc.rules.lancelotKeepCards) && rc.rules.lancelotKeepCards >= 0, '不转换卡数量缺失');
      req(['public', 'anonymous', 'hidden'].includes(rc.rules.voteVisibility), '投票可见性缺失');
      req(['count', 'binary'].includes(rc.rules.missionFailDetail), '任务失败详情缺失');
      // limits：三个时长为 0（不限）或正整数；票型展示 ∈ {3,5,8,10}
      req(rc.limits && typeof rc.limits === 'object', '时间限制缺失');
      ['speechTimeout', 'roundTimeout', 'voteTimeout'].forEach(k => {
        req(rc.limits[k] === 0 || (isNum(rc.limits[k]) && rc.limits[k] > 0), '限时字段缺失：' + k);
      });
      req([3, 5, 8, 10].includes(rc.limits.voteRevealDuration), '票型展示时长必须为3/5/8/10');
      // meta：名称与描述非空
      req(rc.meta && typeof rc.meta === 'object', '会议信息缺失');
      req(isStr(rc.meta.roomName), '会议名称缺失');
      req(isStr(rc.meta.roomDescription), '会议描述缺失');
      // spectator
      req(rc.spectator && typeof rc.spectator === 'object', '观战设置缺失');
      req(isBool(rc.spectator.allow), '观战开关缺失');
      req(isNum(rc.spectator.max) && rc.spectator.max >= 0, '观战上限缺失');

      // 校验通过，直接用传入值初始化（无 fallback）
      const n = rc.roles.good.length + rc.roles.evil.length;
      const selected = {};
      CONFIG_GOOD_ROLES.forEach(r => { selected[r] = rc.roles.good.includes(r); });
      CONFIG_EVIL_ROLES.forEach(r => { selected[r] = rc.roles.evil.includes(r); });
      CONFIG_FORCED_ROLES.forEach(r => { selected[r] = true; });

      const patch = { selectedRoles: selected, playerCount: n };
      patch.rules = { ...rc.rules };
      patch.ladyOfTheLake = !!rc.rules.ladyOfTheLake;
      patch.ladyOfTheLakeRound = rc.rules.ladyOfTheLakeRound;
      const max = rc.spectator.max || 0;
      patch.allowSpectator = rc.spectator.allow !== false;
      patch.spectatorLimited = max > 0;
      patch.maxSpectators = max > 0 ? max : '';
      patch.roomName = rc.meta.roomName;
      patch.roomDescription = rc.meta.roomDescription;
      // limits → index（0=不限 → '不限' → index 0）
      patch.speechTimeoutIndex = SPEECH_OPTIONS.indexOf(rc.limits.speechTimeout === 0 ? '不限' : rc.limits.speechTimeout + '秒');
      patch.roundTimeoutIndex = ROUND_OPTIONS.indexOf(rc.limits.roundTimeout === 0 ? '不限' : rc.limits.roundTimeout + '秒');
      patch.voteTimeoutIndex = VOTE_OPTIONS.indexOf(rc.limits.voteTimeout === 0 ? '不限' : rc.limits.voteTimeout + '秒');
      patch.voteRevealDurationIndex = VOTE_REVEAL_OPTIONS.indexOf(rc.limits.voteRevealDuration + '秒');

      this.setData(patch);
      this.computeAll();
    },
    applyDefaultConfig(n) {
      const def = DEFAULT_CONFIGS[n] || DEFAULT_CONFIGS[5];
      const selected = {};
      CONFIG_GOOD_ROLES.forEach(r => { selected[r] = false; });
      CONFIG_EVIL_ROLES.forEach(r => { selected[r] = false; });
      def.good.forEach(r => { if (r !== 'loyal') selected[r] = true; });
      def.evil.forEach(r => { selected[r] = true; });
      CONFIG_FORCED_ROLES.forEach(r => { selected[r] = true; });

      const rules = buildDefaultRule();
      const hasLancelot = selected.lancelotBlue || selected.lancelotRed;
      rules.lancelotMustFail = hasLancelot;
      rules.oberonMustFailMission = !hasLancelot;

      this.setData({
        selectedRoles: selected,
        rules: rules,
        ladyOfTheLake: n >= 10,
        ladyOfTheLakeRound: n >= 10 ? 2 : 2,
        speechTimeoutIndex: 0,
        roundTimeoutIndex: 0,
        voteTimeoutIndex: 0,
        voteRevealDurationIndex: 2,
        goodCount: def.good.filter(r => r !== 'loyal').length,
        evilCount: def.evil.length
      });
      this.computeAll();
    },
    onPlayerCountChange(e) {
      const n = parseInt(e.currentTarget.dataset.count);
      this.setData({ playerCount: n });
      this.applyDefaultConfig(n);
      this.computeAll();
    },
    onRoleToggle(e) {
      const role = e.currentTarget.dataset.role;
      const current = this.data.selectedRoles;
      if (current[role] && CONFIG_FORCED_ROLES.includes(role)) return;
      current[role] = !current[role];
      this.setData({ selectedRoles: current });
      this.computeAll();
    },
    onRuleToggle(e) {
      const { field } = e.currentTarget.dataset;
      const rules = this.data.rules;
      rules[field] = !rules[field];
      this.setData({ rules });
    },
    onRulePicker(e) {
      const { field } = e.currentTarget.dataset;
      const rules = this.data.rules;
      const range = e.currentTarget.dataset.range;
      rules[field] = range ? range[e.detail.value] : e.detail.value;
      this.setData({ rules });
    },
    onRuleSegment(e) {
      const { field, val } = e.currentTarget.dataset;
      const rules = this.data.rules;
      rules[field] = val;
      this.setData({ rules });
    },
    onLadyToggle() {
      this.setData({ ladyOfTheLake: !this.data.ladyOfTheLake });
    },
    onLadyRoundChange(e) {
      this.setData({ ladyOfTheLakeRound: Number(e.detail.value) + 1 });
    },
    onSpectatorToggle() {
      this.setData({ allowSpectator: !this.data.allowSpectator });
    },
    onSpectatorLimitMode(e) {
      const limited = e.currentTarget.dataset.val === 'true';
      this.setData({ spectatorLimited: limited });
    },
    onSpectatorLimitInput(e) {
      const val = e.detail.value;
      const num = parseInt(val, 10);
      const invalid = val !== '' && (isNaN(num) || num < 1 || num > 100);
      this.setData({ maxSpectators: val, spectatorLimitInvalid: invalid });
    },
    onLimitChange(e) {
      const { field } = e.currentTarget.dataset;
      const data = {};
      data[field] = e.detail.value;
      this.setData(data);
    },
    onMetaInput(e) {
      const { field } = e.currentTarget.dataset;
      const data = {};
      data[field] = e.detail.value;
      this.setData(data);
    },
    prevPage() {
      const { logicalPage, visiblePages } = this.data;
      if (logicalPage > 0) {
        const newPage = logicalPage - 1;
        this.setData({ logicalPage: newPage, swiperPage: visiblePages[newPage] });
      }
    },
    nextPage() {
      const { logicalPage, visiblePages, roleWarning } = this.data;
      if (logicalPage === 0 && roleWarning) return;
      if (logicalPage < visiblePages.length - 1) {
        const newPage = logicalPage + 1;
        this.setData({ logicalPage: newPage, swiperPage: visiblePages[newPage] });
      }
    },
    onSwiperChange(e) {
      const swiperIdx = e.detail.current;
      const logicalIdx = this.data.visiblePages.indexOf(swiperIdx);
      if (logicalIdx >= 0) {
        this.setData({ logicalPage: logicalIdx });
      }
    },
    computeLoyalCount() {
      const sel = this.data.selectedRoles;
      let goodCount = 0, evilCount = 0;
      CONFIG_GOOD_ROLES.forEach(r => { if (sel[r]) goodCount++; });
      CONFIG_EVIL_ROLES.forEach(r => { if (sel[r]) evilCount++; });
      const loyal = this.data.playerCount - goodCount - evilCount;
      let warning = '';
      if (loyal < 0) {
        warning = `蓝方+红方超出总人数 ${Math.abs(loyal)} 位，请减少选择`;
      }
      this.setData({ loyalCount: Math.max(loyal, 0), roleWarning: warning, goodCount, evilCount });
    },
    computeTeamSizes() {
      this.setData({ teamSizes: TEAM_SIZES[this.data.playerCount] || TEAM_SIZES[5] });
    },
    computeVisiblePages() {
      const sel = this.data.selectedRoles;
      const hasLancelot = sel.lancelotBlue || sel.lancelotRed;
      const pages = [0, 1];
      if (hasLancelot) pages.push(2);
      pages.push(4);
      pages.push(5);
      this.setData({
        visiblePages: pages,
        pageCount: pages.length,
        logicalPage: Math.min(this.data.logicalPage, pages.length - 1),
        swiperPage: pages[Math.min(this.data.logicalPage, pages.length - 1)]
      });
    },
    computeAll() {
      this.computeLoyalCount();
      this.computeTeamSizes();
      this.computeVisiblePages();

      const sel = this.data.selectedRoles;
      const good = [];
      if (sel.merlin) good.push('梅林');
      if (sel.percival) good.push('派西');
      if (sel.lancelotBlue) good.push('蓝兰');
      if (this.data.loyalCount > 0) good.push('忠臣×' + this.data.loyalCount);
      const evil = [];
      if (sel.morgana) evil.push('莫甘娜');
      if (sel.assassin) evil.push('刺客');
      if (sel.mordred) evil.push('莫德雷德');
      if (sel.oberon) evil.push('奥伯伦');
      if (sel.minion) evil.push('爪牙');
      if (sel.lancelotRed) evil.push('红兰');

      const speech = this.data.speechTimeoutIndex > 0 ? SPEECH_OPTIONS[this.data.speechTimeoutIndex] : '不限';
      const spec = this.data.allowSpectator ? (this.data.spectatorLimited ? '允许（上限' + this.data.maxSpectators + '人）' : '允许（不限人数）') : '不允许';
      const lady = this.data.ladyOfTheLake ? '启用（第' + this.data.ladyOfTheLakeRound + '轮）' : '未启用';

      this.setData({
        goodRoleNames: good.join('、'),
        evilRoleNames: evil.join('、'),
        summarySpeech: speech,
        summarySpec: spec,
        summaryLady: lady
      });
    },
    getRoomConfig() {
      const good = [];
      const evil = [];
      CONFIG_GOOD_ROLES.forEach(r => { if (this.data.selectedRoles[r]) good.push(r); });
      CONFIG_EVIL_ROLES.forEach(r => { if (this.data.selectedRoles[r]) evil.push(r); });
      for (let i = 0; i < this.data.loyalCount; i++) { good.push('loyal'); }

      const limits = {
        speechTimeout: this.data.speechTimeoutIndex > 0 ? parseInt(SPEECH_OPTIONS[this.data.speechTimeoutIndex]) : 0,
        roundTimeout: this.data.roundTimeoutIndex > 0 ? parseInt(ROUND_OPTIONS[this.data.roundTimeoutIndex]) : 0,
        voteTimeout: this.data.voteTimeoutIndex > 0 ? parseInt(VOTE_OPTIONS[this.data.voteTimeoutIndex]) : 0,
        voteRevealDuration: parseInt(VOTE_REVEAL_OPTIONS[this.data.voteRevealDurationIndex] || '5')
      };

      const meta = {
        roomName: this.data.roomName || '',
        roomDescription: this.data.roomDescription || 'Welcome to Join the Conference!',
        tags: this.data.tags || []
      };

      return {
        roles: { good, evil },
        rules: {
          ...this.data.rules,
          ladyOfTheLake: this.data.ladyOfTheLake,
          ladyOfTheLakeRound: this.data.ladyOfTheLakeRound
        },
        limits,
        meta,
        spectator: {
          allow: this.data.allowSpectator,
          max: this.data.spectatorLimited ? (Number(this.data.maxSpectators) || 0) : 0
        }
      };
    },
    // 提交：mode=create → /rooms/create；mode=update → updateRoomConfig
    submit() {
      if (this.data.spectatorLimited) {
        const n = Number(this.data.maxSpectators);
        if (!n || n < 1 || n > 100) {
          this.setData({ spectatorLimitInvalid: true });
          wx.showToast({ title: '观战人数需在 1-100 之间', icon: 'none' });
          return;
        }
      }
      const config = this.getRoomConfig();
      if (this.data.mode === 'update') {
        wx.showLoading({ title: '保存中...', mask: true });
        api.updateRoomConfig(this.data.roomId, config).then(() => {
          wx.hideLoading();
          this.setData({ showConfig: false });
          this.triggerEvent('success');
        }).catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        });
      } else {
        const ui = this.data.userInfo || {};
        const app = getApp();
        wx.showLoading({ title: '召开会议中...', mask: true });
        api.request('/rooms/create', {
          method: 'POST',
          data: {
            hostOpenId: ui.openId || app.globalData.openId,
            hostNickName: ui.customNickName || ui.nickName || '房主',
            hostWxNickName: (ui.wxNickName || ui.nickName) || '',
            hostAvatarUrl: ui.avatarUrl || '',
            roomConfig: config
          }
        }).then((res) => {
          wx.hideLoading();
          if (res.success) {
            this.setData({ showConfig: false });
            this.triggerEvent('success', { roomId: res.roomId });
          } else {
            wx.showToast({ title: (res && res.message) || '创建失败', icon: 'none' });
          }
        }).catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
        });
      }
    }
  }
});
