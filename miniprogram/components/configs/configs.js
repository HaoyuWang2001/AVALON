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
    roomDescription: '',
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
  observers: {
    roomConfig(rc) {
      if (rc) this._applyConfig(rc);
    }
  },
  methods: {
    // 打开弹窗：无状态——每次从 properties 重新初始化
    open() {
      if (this.data.roomConfig) this._applyConfig(this.data.roomConfig);
      else this.applyDefaultConfig(this.data.playerCount);
      // create 模式：默认会议名（"昵称的会议"）
      if (this.data.mode === 'create' && !this.data.roomName) {
        const ui = this.data.userInfo || {};
        this.setData({ roomName: (ui.customNickName || ui.nickName || '房主') + '的会议' });
      }
      this.setData({ showConfig: true, spectatorLimitInvalid: false });
    },
    // 关闭弹窗：丢弃所有修改（下次 open 重新初始化）
    close() {
      this.setData({ showConfig: false, spectatorLimitInvalid: false });
      this.triggerEvent('close');
    },
    // 从现有房间配置初始化（room 编辑模式）
    _applyConfig(rc) {
      const roles = rc.roles || { good: [], evil: [] };
      const n = (roles.good || []).length + (roles.evil || []).length;
      const selected = {};
      CONFIG_GOOD_ROLES.forEach(r => { selected[r] = (roles.good || []).includes(r); });
      CONFIG_EVIL_ROLES.forEach(r => { selected[r] = (roles.evil || []).includes(r); });
      CONFIG_FORCED_ROLES.forEach(r => { selected[r] = true; });

      const patch = { selectedRoles: selected, playerCount: n || 5 };

      if (rc.rules) {
        patch.rules = { ...this.data.rules, ...rc.rules };
        patch.ladyOfTheLake = !!rc.rules.ladyOfTheLake;
        patch.ladyOfTheLakeRound = rc.rules.ladyOfTheLakeRound || 2;
      }
      if (rc.spectator) {
        const max = rc.spectator.max || 0;
        patch.allowSpectator = rc.spectator.allow !== false;
        patch.spectatorLimited = max > 0;
        patch.maxSpectators = max > 0 ? max : '';
      }
      if (rc.meta) {
        patch.roomName = rc.meta.roomName || '';
        patch.roomDescription = rc.meta.roomDescription || '';
      }
      if (rc.limits) {
        const l = rc.limits;
        if (l.speechTimeout !== undefined) {
          const idx = SPEECH_OPTIONS.indexOf(l.speechTimeout === null ? '不限' : l.speechTimeout + '秒');
          if (idx >= 0) patch.speechTimeoutIndex = idx;
        }
        if (l.roundTimeout !== undefined) {
          const idx = ROUND_OPTIONS.indexOf(l.roundTimeout === null ? '不限' : l.roundTimeout + '秒');
          if (idx >= 0) patch.roundTimeoutIndex = idx;
        }
        if (l.voteTimeout !== undefined) {
          const idx = VOTE_OPTIONS.indexOf(l.voteTimeout === null ? '不限' : l.voteTimeout + '秒');
          if (idx >= 0) patch.voteTimeoutIndex = idx;
        }
        if (l.voteRevealDuration !== undefined) {
          const idx = VOTE_REVEAL_OPTIONS.indexOf(l.voteRevealDuration + '秒');
          if (idx >= 0) patch.voteRevealDurationIndex = idx;
        }
      }

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
        speechTimeout: this.data.speechTimeoutIndex > 0 ? SPEECH_OPTIONS[this.data.speechTimeoutIndex] === '不限' ? null : parseInt(SPEECH_OPTIONS[this.data.speechTimeoutIndex]) : null,
        roundTimeout: this.data.roundTimeoutIndex > 0 ? ROUND_OPTIONS[this.data.roundTimeoutIndex] === '不限' ? null : parseInt(ROUND_OPTIONS[this.data.roundTimeoutIndex]) : null,
        voteTimeout: this.data.voteTimeoutIndex > 0 ? VOTE_OPTIONS[this.data.voteTimeoutIndex] === '不限' ? null : parseInt(VOTE_OPTIONS[this.data.voteTimeoutIndex]) : null,
        voteRevealDuration: parseInt(VOTE_REVEAL_OPTIONS[this.data.voteRevealDurationIndex] || '5')
      };

      const meta = {
        roomName: this.data.roomName || '',
        roomDescription: this.data.roomDescription || '',
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
