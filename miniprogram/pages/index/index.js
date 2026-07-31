// pages/index/index.js
const api = require('../../services/api.js');

const GOOD_ROLES = ['merlin', 'percival', 'lancelotBlue'];
const EVIL_ROLES = ['morgana', 'assassin', 'mordred', 'minion', 'oberon', 'lancelotRed'];

const ROLE_NAMES = {
  merlin: '梅林', percival: '派西', loyal: '忠臣',
  lancelotBlue: '蓝兰', lancelotRed: '红兰',
  morgana: '莫甘娜', assassin: '刺客', mordred: '莫德雷德',
  minion: '爪牙', oberon: '奥伯伦'
};

const DEFAULT_CONFIGS = {
  5:  { good: ['merlin','percival'], evil: ['morgana','assassin'] },
  6:  { good: ['merlin','percival'], evil: ['morgana','assassin'] },
  7:  { good: ['merlin','percival'], evil: ['morgana','assassin','oberon'] },
  8:  { good: ['merlin','percival'], evil: ['morgana','assassin','minion'] },
  9:  { good: ['merlin','percival'], evil: ['morgana','assassin','mordred'] },
  10: { good: ['merlin','percival'], evil: ['morgana','assassin','mordred','oberon'] },
  11: { good: ['merlin','percival'], evil: ['morgana','mordred','oberon','lancelotBlue','lancelotRed'] },
  12: { good: ['merlin','percival'], evil: ['morgana','assassin','mordred','oberon','lancelotBlue','lancelotRed'] }
};

const SPEECH_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒', '150秒', '180秒'];
const ROUND_OPTIONS = ['不限', '30秒', '60秒', '90秒', '120秒'];
const VOTE_OPTIONS = ['不限', '15秒', '30秒', '45秒', '60秒'];
const DEFAULT_AVATAR = '/images/default-avatar.png';

const TEAM_SIZES = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,5], 10: [3,4,4,5,5],
  11: [3,4,5,6,6], 12: [3,4,5,6,6]
};

function buildDefaultRule() {
  return {
    evilKnowsEachOther: true, lancelotsKnowEachOther: true, lancelotSwapRound: 2,
    ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
    oberonMustFailMission: false, redLancelotMustFailMission: false,
    voteVisibility: 'public', missionFailDetail: 'count'
  };
}

Page({
  data: {
    userInfo: { avatarUrl: '', nickName: '' },
    customNickName: '',
    currentRoom: null,

    showConfig: false,
    playerCount: 5,
    logicalPage: 0,
    visiblePages: [0, 1, 5],
    goodCount: 2,
    evilCount: 2,
    teamSizes: [3,4,4,5,5],

    roleLabel: {
      merlin: '梅林', percival: '派西', loyal: '忠臣',
      lancelotBlue: '蓝兰', lancelotRed: '红兰',
      morgana: '莫甘娜', assassin: '刺客', mordred: '莫德雷德',
      minion: '爪牙', oberon: '奥伯伦'
    },  // default: page0=role, page1=rules, page5=final

    selectedRoles: {
      merlin: true, percival: true, lancelotBlue: false,
      morgana: true, assassin: true, mordred: false,
      minion: false, oberon: false, lancelotRed: false
    },
    loyalCount: 0,
    roleWarning: '',

    rules: buildDefaultRule(),
    ladyOfTheLake: false,
    ladyOfTheLakeRound: 2,

    merlinCanSee: { assassin: true, morgana: true, minion: true, oberon: true, lancelotRed: true, lancelotBlue: false },
    merlinCanIdentify: { lancelotRed: false, lancelotBlue: false },

    speechTimeoutIndex: 0,
    roundTimeoutIndex: 0,
    voteTimeoutIndex: 0,

    speechOptions: SPEECH_OPTIONS,
    roundOptions: ROUND_OPTIONS,
    voteOptions: VOTE_OPTIONS,

    roomName: '',
    roomDescription: 'Welcome Join the Conference!',
    tags: [],

    pageCount: 3,
    swiperPage: 0,

    allowSpectator: true,
    maxSpectators: 0,

    goodRoleNames: '',
    evilRoleNames: '',
    summarySpeech: '',
    summarySpec: '',
    summaryLady: ''
  },

  onLoad() {
    const savedNickName = wx.getStorageSync('customNickName');
    if (savedNickName) { this.setData({ customNickName: savedNickName }); }
    const app = getApp();
    if (app.globalData.userInfo) {
      this.setData({ userInfo: app.globalData.userInfo });
    }
    const savedAvatar = wx.getStorageSync('avatarUrl');
    if (savedAvatar) {
      this.setData({ 'userInfo.avatarUrl': savedAvatar });
    } else {
      this.setData({ 'userInfo.avatarUrl': DEFAULT_AVATAR });
    }
    if (app.globalData.userInfo) {
      app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: savedAvatar || DEFAULT_AVATAR };
    }
    this.applyDefaultConfig(this.data.playerCount);
    this.computeAll();

    if (app.globalData.openId) {
      this.loadUserProfile();
    } else {
      app.openIdReadyCallback = () => {
        this.loadUserProfile();
        this.checkCurrentRoom();
      };
    }

    if (app.globalData.openId) {
      this.checkCurrentRoom();
    }
  },

  checkCurrentRoom() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    api.getCurrentRoom(openId).then(res => {
      if (res && res.success && res.room) {
        this.setData({ currentRoom: res.room });
      }
    }).catch(() => {});
  },

  backToRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    if (room.gameStarted) {
      wx.navigateTo({ url: `/pages/game/game?gameId=${room.gameId}&roomId=${room.roomId}` });
    } else {
      wx.navigateTo({ url: `/pages/room/room?roomId=${room.roomId}&isHost=false` });
    }
  },

  exitCurrentRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    wx.showModal({
      title: '退出房间',
      content: `确定退出房间 ${room.roomId} 吗？`,
      success: (res) => {
        if (res.confirm) {
          api.leaveRoom(room.roomId).then(() => {
            this.setData({ currentRoom: null });
            getApp().globalData.roomId = null;
            wx.showToast({ title: '已退出', icon: 'success' });
          }).catch(() => {});
        }
      }
    });
  },

  loadUserProfile() {
    const app = getApp();
    if (app.globalData.profileLoaded) return;
    app.globalData.profileLoaded = true;
    const openId = app.globalData.openId;
    if (!openId) return;
    api.getUserProfile(openId).then(res => {
      if (res && res.success && res.user) {
        const u = res.user;
        const updates = {};
        if (u.wxNickName) {
          updates['userInfo.nickName'] = u.wxNickName;
          if (app.globalData.userInfo) {
            app.globalData.userInfo.nickName = u.wxNickName;
          }
        }
        if (u.customNickName) {
          updates.customNickName = u.customNickName;
          wx.setStorageSync('customNickName', u.customNickName);
        }
        if (u.avatarUrl) {
          updates['userInfo.avatarUrl'] = u.avatarUrl;
          wx.setStorageSync('avatarUrl', u.avatarUrl);
        }
        if (Object.keys(updates).length > 0) {
          this.setData(updates);
        }
      }
    }).catch(() => {});
  },

  onAvatarError() {},

  onChooseAvatar(e) {
    if (!e.detail || !e.detail.avatarUrl) return;
    const tempPath = e.detail.avatarUrl;
    const app = getApp();
    const openId = app.globalData.openId || wx.getStorageSync('openId') || 'default';

    this.setData({ 'userInfo.avatarUrl': tempPath });
    app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: tempPath };

    const fs = wx.getFileSystemManager();
    const savedPath = wx.env.USER_DATA_PATH + '/avatar_' + openId + '.jpg';
    fs.saveFile({
      tempFilePath: tempPath,
      filePath: savedPath,
      success: () => {
        wx.setStorageSync('avatarUrl', savedPath);
        this.setData({ 'userInfo.avatarUrl': savedPath });
        app.globalData.userInfo = { ...app.globalData.userInfo, avatarUrl: savedPath };
        if (openId) {
          api.updateUserProfile(openId, { avatarUrl: savedPath }).catch(() => {});
        }
      },
      fail: () => {
        wx.setStorageSync('avatarUrl', tempPath);
      }
    });
  },

  onWxNickInput(e) {
    const nickName = e.detail.value;
    if (!nickName) return;
    this.setData({ 'userInfo.nickName': nickName });
    const app = getApp();
    app.globalData.userInfo = { ...app.globalData.userInfo, nickName };
    const openId = app.globalData.openId;
    if (openId) {
      api.updateUserProfile(openId, { wxNickName: nickName }).catch(() => {});
    }
  },

  onWxNickBlur() {},

  showNickNameModal() {
    const savedNickName = wx.getStorageSync('customNickName') || '';
    wx.showModal({
      title: '修改昵称', editable: true, placeholderText: '请输入昵称',
      content: savedNickName,
      success: (res) => {
        if (res.confirm && res.content) {
          const nickName = res.content.trim();
          if (nickName.length > 0 && nickName.length <= 10) {
            wx.setStorageSync('customNickName', nickName);
            this.setData({ customNickName: nickName });
            const openId = getApp().globalData.openId;
            if (openId) {
              api.updateUserProfile(openId, { customNickName: nickName }).catch(() => {});
            }
          }
        }
      }
    });
  },

  // ─────────── Config Modal ───────────

  showConfig() {
    const name = this.data.customNickName || (this.data.userInfo && this.data.userInfo.nickName) || '房主';
    this.setData({
      showConfig: true, logicalPage: 0, swiperPage: this.data.visiblePages[0] || 0,
      roomName: name + '的会议'
    });
  },

  closeConfig() {
    this.setData({ showConfig: false });
  },

  // ─────────── Page 1: Player Count + Roles ───────────

  onPlayerCountChange(e) {
    const n = parseInt(e.currentTarget.dataset.count);
    this.setData({ playerCount: n });
    this.applyDefaultConfig(n);
    this.computeAll();
  },

  applyDefaultConfig(n) {
    const def = DEFAULT_CONFIGS[n] || DEFAULT_CONFIGS[5];
    const selected = {};
    GOOD_ROLES.forEach(r => { selected[r] = false; });
    EVIL_ROLES.forEach(r => { selected[r] = false; });
    def.good.forEach(r => { if (r !== 'loyal') selected[r] = true; });
    def.evil.forEach(r => { selected[r] = true; });

    const canSee = { assassin: true, morgana: true, minion: true, oberon: true, lancelotRed: true, lancelotBlue: false };
    const rules = buildDefaultRule();
    const hasLancelot = selected.lancelotBlue || selected.lancelotRed;
    rules.redLancelotMustFailMission = hasLancelot;
    rules.oberonMustFailMission = !hasLancelot;

    this.setData({
      selectedRoles: selected,
      rules: rules,
      ladyOfTheLake: n >= 10,
      ladyOfTheLakeRound: n >= 10 ? 2 : 2,
      merlinCanSee: { ...canSee },
      merlinCanIdentify: {
        lancelotRed: selected.lancelotRed || false,
        lancelotBlue: selected.lancelotBlue || false
      },
      speechTimeoutIndex: 0,
      roundTimeoutIndex: 0,
      voteTimeoutIndex: 0,
      goodCount: def.good.filter(r => r !== 'loyal').length + (def.good.includes('loyal') ? 0 : 0),
      evilCount: def.evil.length,
    });
  },

  onRoleToggle(e) {
    const role = e.currentTarget.dataset.role;
    const current = this.data.selectedRoles;
    current[role] = !current[role];
    this.setData({ selectedRoles: current });
    this.computeAll();
  },

  // ─────────── Page 2: Must-Set Rules ───────────

  onRuleToggle(e) {
    const { field } = e.currentTarget.dataset;
    const rules = this.data.rules;
    rules[field] = !rules[field];
    this.setData({ rules });
  },

  onRulePicker(e) {
    const { field } = e.currentTarget.dataset;
    const rules = this.data.rules;
    rules[field] = e.detail.value;
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
    this.setData({ ladyOfTheLakeRound: e.detail.value });
  },

  onSpectatorToggle() {
    this.setData({ allowSpectator: !this.data.allowSpectator });
  },

  onSpectatorLimitInput(e) {
    let val = parseInt(e.detail.value) || 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    this.setData({ maxSpectators: val });
  },

  // ─────────── Page 5: Merlin Vision ───────────

  onCanSeeToggle(e) {
    const role = e.currentTarget.dataset.role;
    const canSee = this.data.merlinCanSee;
    canSee[role] = !canSee[role];
    if (!canSee[role]) {
      const canIdentify = this.data.merlinCanIdentify;
      delete canIdentify[role];
      this.setData({ merlinCanIdentify: canIdentify });
    }
    this.setData({ merlinCanSee: canSee });
  },

  onCanIdentifyToggle(e) {
    const role = e.currentTarget.dataset.role;
    const canIdentify = this.data.merlinCanIdentify;
    canIdentify[role] = !canIdentify[role];
    this.setData({ merlinCanIdentify: canIdentify });
  },

  // ─────────── Page 6: Limits + Meta ───────────

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

  // ─────────── Navigation ───────────

  prevPage() {
    const { logicalPage, visiblePages } = this.data;
    if (logicalPage > 0) {
      const newPage = logicalPage - 1;
      this.setData({ logicalPage: newPage, swiperPage: visiblePages[newPage] });
    }
  },

  nextPage() {
    const { logicalPage, visiblePages } = this.data;
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

  // ─────────── Computations ───────────

  computeLoyalCount() {
    const sel = this.data.selectedRoles;
    let goodCount = 0, evilCount = 0;
    GOOD_ROLES.forEach(r => { if (sel[r]) goodCount++; });
    EVIL_ROLES.forEach(r => { if (sel[r]) evilCount++; });
    const loyal = this.data.playerCount - goodCount - evilCount;
    let warning = '';
    if (loyal < 0) {
      warning = `好人+坏人超出总人数 ${Math.abs(loyal)} 位，请减少选择`;
    }
    this.setData({ loyalCount: Math.max(loyal, 0), roleWarning: warning, goodCount, evilCount });
  },

  computeTeamSizes() {
    this.setData({ teamSizes: TEAM_SIZES[this.data.playerCount] || TEAM_SIZES[5] });
  },

  computeVisiblePages() {
    const sel = this.data.selectedRoles;
    const hasLancelot = sel.lancelotBlue || sel.lancelotRed;
    const hasMerlin = sel.merlin;

    const pages = [0, 1];
    if (hasLancelot) pages.push(2);
    if (hasMerlin) pages.push(4);
    pages.push(5);
    pages.push(6);

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
    const spec = this.data.allowSpectator ? (this.data.maxSpectators > 0 ? '允许（上限' + this.data.maxSpectators + '人）' : '允许') : '不允许';
    const lady = this.data.ladyOfTheLake ? '启用（第' + this.data.ladyOfTheLakeRound + '轮）' : '未启用';

    this.setData({
      goodRoleNames: good.join('、'),
      evilRoleNames: evil.join('、'),
      summarySpeech: speech,
      summarySpec: spec,
      summaryLady: lady
    });
  },

  // ─────────── Create Room ───────────

  getMerlinVision() {
    const canSee = [];
    const canIdentify = [];
    Object.keys(this.data.merlinCanSee).forEach(role => {
      if (this.data.merlinCanSee[role]) canSee.push(role);
    });
    Object.keys(this.data.merlinCanIdentify).forEach(role => {
      if (this.data.merlinCanIdentify[role]) canIdentify.push(role);
    });
    return { canSee, canIdentify };
  },

  getRoomConfig() {
    const good = [];
    const evil = [];
    GOOD_ROLES.forEach(r => { if (this.data.selectedRoles[r]) good.push(r); });
    EVIL_ROLES.forEach(r => { if (this.data.selectedRoles[r]) evil.push(r); });
    for (let i = 0; i < this.data.loyalCount; i++) { good.push('loyal'); }

    const limits = {
      speechTimeout: this.data.speechTimeoutIndex > 0 ? SPEECH_OPTIONS[this.data.speechTimeoutIndex] === '不限' ? null : parseInt(SPEECH_OPTIONS[this.data.speechTimeoutIndex]) : null,
      roundTimeout: this.data.roundTimeoutIndex > 0 ? ROUND_OPTIONS[this.data.roundTimeoutIndex] === '不限' ? null : parseInt(ROUND_OPTIONS[this.data.roundTimeoutIndex]) : null,
      voteTimeout: this.data.voteTimeoutIndex > 0 ? VOTE_OPTIONS[this.data.voteTimeoutIndex] === '不限' ? null : parseInt(VOTE_OPTIONS[this.data.voteTimeoutIndex]) : null
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
      merlinVision: this.getMerlinVision(),
      spectator: {
        allow: this.data.allowSpectator,
        max: this.data.maxSpectators
      }
    };
  },

  createRoom() {
    const config = this.getRoomConfig();
    wx.showLoading({ title: '召开会议中...' });
    api.request('/rooms/create', {
      method: 'POST',
      data: {
        hostOpenId: this.data.userInfo.openId || getApp().globalData.openId,
        hostNickName: this.data.customNickName || this.data.userInfo.nickName || '房主',
        hostWxNickName: (this.data.userInfo && this.data.userInfo.nickName) || '',
        hostAvatarUrl: (this.data.userInfo && this.data.userInfo.avatarUrl) || '',
        roomConfig: config
      }
    }).then(res => {
      if (res.success) {
        this.setData({ showConfig: false });
        const app = getApp();
        app.globalData.roomId = res.roomId;
        wx.hideLoading();
        wx.redirectTo({ url: `/pages/room/room?roomId=${res.roomId}&isHost=true` });
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.message || '创建失败', icon: 'error' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '创建失败', icon: 'error' });
      console.error('开始拉会失败:', err);
    });
  },

  joinRoom() {
    wx.showModal({
      title: '加入会议', editable: true, placeholderText: '6位会议ID',
      success: (res) => {
        if (res.confirm && res.content) {
          const roomId = res.content.trim();
          if (roomId.length === 6) {
            this.doJoinRoom(roomId, 0);
          }
        }
      }
    });
  },

  doJoinRoom(roomId, seatNumber) {
    wx.showLoading({ title: '加入会议中...' });
    api.joinRoom(roomId, seatNumber).then(res => {
      wx.hideLoading();
      if (res.success) {
        const app = getApp();
        app.globalData.roomId = roomId;
        wx.redirectTo({ url: `/pages/room/room?roomId=${roomId}&isHost=false` });
      }
    });
  }
});
