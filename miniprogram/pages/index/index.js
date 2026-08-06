// pages/index/index.js
const api = require('../../services/api.js');

const GOOD_ROLES = ['merlin', 'percival', 'lancelotBlue'];
const EVIL_ROLES = ['morgana', 'assassin', 'mordred', 'minion', 'oberon', 'lancelotRed'];
const FORCED_ROLES = ['merlin', 'percival', 'morgana'];

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
const VOTE_REVEAL_OPTIONS = ['3秒', '5秒', '8秒', '10秒'];
const DEFAULT_AVATAR = '/images/default-avatar.png';

function formatDuration(seconds) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '小时' + (m > 0 ? m + '分钟' : '');
  if (m > 0) return m + '分钟';
  return '不足1分钟';
}

const TEAM_SIZES = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,5], 10: [3,4,4,5,5],
  11: [3,4,5,6,6], 12: [3,4,5,6,6]
};

function buildDefaultRule() {
  return {
    evilKnowsEachOther: true, lancelotsKnowEachOther: false, lancelotSwapRound: 2,
    ladyOfTheLake: false, ladyOfTheLakeRound: 2, maxFailedNominations: 3,
    oberonMustFailMission: false, lancelotMustFail: false,
    voteVisibility: 'public', missionFailDetail: 'count',
    evilsKnowRedLancelot: true, oberonKnowsRedLancelot: true, merlinKnowsLancelotSide: true
  };
}

Page({
  data: {
    userInfo: { avatarUrl: '', nickName: '' },
    customNickName: '',
    currentRoom: null,
    isCurrentRoomHost: false,
    userStatusText: '在线',
    userStatusClass: 'status-online',

    showConfig: false,
    playerCount: 5,
    logicalPage: 0,
    visiblePages: [0, 1, 4, 5],
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

    speechTimeoutIndex: 0,
    roundTimeoutIndex: 0,
    voteTimeoutIndex: 0,
    voteRevealDurationIndex: 1,

    speechOptions: SPEECH_OPTIONS,
    roundOptions: ROUND_OPTIONS,
    voteOptions: VOTE_OPTIONS,
    voteRevealOptions: VOTE_REVEAL_OPTIONS,

    roomName: '',
    roomDescription: 'Welcome Join the Conference!',
    tags: [],

    pageCount: 3,
    swiperPage: 0,

    allowSpectator: true,
    maxSpectators: '',
    spectatorLimited: false,
    spectatorLimitInvalid: false,

    goodRoleNames: '',
    evilRoleNames: '',
    summarySpeech: '',
    summarySpec: '',
    summaryLady: '',

    showInfo: false,
    historyList: [],
    totalWinRate: '',
    goodWinRate: '',
    evilWinRate: '',
    roleStats: []
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
      this.loadHistoryAndStats();
    } else {
      app.openIdReadyCallback = () => {
        this.loadUserProfile();
        this.checkCurrentRoom();
        this.loadHistoryAndStats();
      };
    }

    if (app.globalData.openId) {
      this.checkCurrentRoom();
    }
  },

  onShow() {
    if (getApp().globalData.openId) {
      this.checkCurrentRoom();
      this.loadHistoryAndStats();
    }
  },

  onPullDownRefresh() {
    this.checkCurrentRoom();
    if (getApp().globalData.openId) {
      this.loadUserProfile();
      this.loadHistoryAndStats();
    }
    wx.stopPullDownRefresh();
  },

  checkCurrentRoom() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    api.getCurrentRoom(openId).then(res => {
      if (res && res.success && res.room) {
        this.setData({
          currentRoom: res.room,
          isCurrentRoomHost: !!(res.room.ownerId && res.room.ownerId === openId)
        });
        // 状态：游戏中(红) / 房间中(蓝)
        if (res.room.gameStarted) {
          this.setData({ userStatusText: '游戏中', userStatusClass: 'status-ingame' });
        } else {
          this.setData({ userStatusText: '房间中', userStatusClass: 'status-inroom' });
        }
      } else if (res && res.success) {
        this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
      }
    }).catch(() => {});
  },

  backToRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    // 游戏进行中且存在 active gameId → 进入游戏；否则回到房间
    if (room.gameStarted && room.gameId) {
      wx.navigateTo({ url: `/pages/game/game?gameId=${room.gameId}&roomId=${room.roomId}` });
    } else {
      wx.navigateTo({ url: `/pages/room/room?roomId=${room.roomId}` });
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
            this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
            getApp().globalData.roomId = null;
            wx.showToast({ title: '已退出', icon: 'success' });
          }).catch(() => {});
        }
      }
    });
  },

  disbandCurrentRoom() {
    const room = this.data.currentRoom;
    if (!room) return;
    wx.showModal({
      title: '解散房间',
      content: `确定解散房间 ${room.roomId} 吗？此操作不可恢复。`,
      success: (res) => {
        if (res.confirm) {
          api.disbandRoom(room.roomId).then(() => {
            this.setData({ currentRoom: null, isCurrentRoomHost: false, userStatusText: '在线', userStatusClass: 'status-online' });
            getApp().globalData.roomId = null;
            wx.showToast({ title: '已解散', icon: 'success' });
          }).catch((err) => {
            wx.showToast({ title: (err && err.message) || '解散失败', icon: 'none' });
          });
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

  loadHistoryAndStats() {
    const openId = getApp().globalData.openId || wx.getStorageSync('openId');
    if (!openId) return;
    api.getUserHistory(openId, 10).then(res => {
      if (res && res.success && Array.isArray(res.history)) {
        const historyList = res.history.map(item => ({
          gameId: item.gameId,
          roleName: ROLE_NAMES[item.role] || item.role,
          side: item.side,
          isWin: !!(item.gameResult && item.gameResult.winner === item.side),
          durationText: formatDuration(item.durationSeconds)
        }));
        this.setData({ historyList });
      }
    }).catch(() => {});
    api.getUserStats(openId).then(res => {
      if (res && res.success && res.stats) {
        const s = res.stats;
        const roleStats = (s.roles || []).filter(r => r.games > 0).map(r => ({
          role: r.role,
          roleName: ROLE_NAMES[r.role] || r.role,
          games: r.games,
          wins: r.wins,
          winRate: r.winRate + '%'
        }));
        this.setData({
          totalWinRate: s.totalGames > 0 ? s.totalWinRate + '%' : '',
          goodWinRate: s.goodGames > 0 ? s.goodWinRate + '%' : '',
          evilWinRate: s.evilGames > 0 ? s.evilWinRate + '%' : '',
          roleStats
        });
      }
    }).catch(() => {});
  },

  showInfoModal() {
    this.setData({ showInfo: true });
  },

  closeInfo() {
    this.setData({ showInfo: false });
  },

  openHistoryGame(e) {
    const gameId = e.currentTarget.dataset.gameid;
    if (!gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
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
    // 必选角色固定选中
    FORCED_ROLES.forEach(r => { selected[r] = true; });

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
      voteRevealDurationIndex: 1,
      goodCount: def.good.filter(r => r !== 'loyal').length + (def.good.includes('loyal') ? 0 : 0),
      evilCount: def.evil.length,
    });
  },

  onRoleToggle(e) {
    const role = e.currentTarget.dataset.role;
    const current = this.data.selectedRoles;
    // 梅林/派西/莫甘娜必选，不可点击取消
    if (current[role] && FORCED_ROLES.includes(role)) return;
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

  // ─────────── Page 5: Limits + Meta ───────────

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

  // ─────────── Computations ───────────

  computeLoyalCount() {
    const sel = this.data.selectedRoles;
    let goodCount = 0, evilCount = 0;
    GOOD_ROLES.forEach(r => { if (sel[r]) goodCount++; });
    EVIL_ROLES.forEach(r => { if (sel[r]) evilCount++; });
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

  // ─────────── Create Room ───────────

  getRoomConfig() {
    const good = [];
    const evil = [];
    GOOD_ROLES.forEach(r => { if (this.data.selectedRoles[r]) good.push(r); });
    EVIL_ROLES.forEach(r => { if (this.data.selectedRoles[r]) evil.push(r); });
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

  createRoom() {
    if (this.data.spectatorLimited) {
      const n = Number(this.data.maxSpectators);
      if (!n || n < 1 || n > 100) {
        this.setData({ spectatorLimitInvalid: true });
        wx.showToast({ title: '观战人数需在 1-100 之间', icon: 'none' });
        return;
      }
    }
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
        // navigateTo 保留 index 在栈底，需先关闭配置弹窗，避免返回时仍显示
        this.setData({ showConfig: false });
        const app = getApp();
        app.globalData.roomId = res.roomId;
        wx.hideLoading();
        wx.navigateTo({ url: `/pages/room/room?roomId=${res.roomId}&isHost=true` });
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
        wx.navigateTo({ url: `/pages/room/room?roomId=${roomId}&isHost=false` });
      }
    });
  }
});
