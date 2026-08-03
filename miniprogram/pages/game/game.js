// pages/game/game.js
const app = getApp();
const api = require('../../services/api.js');

// 标准标签配色：浅紫底深紫字 / 浅蓝底蓝字 / 浅粉底粉字 / 浅金底金字
const TAG_STYLES = {
  purple: 'ptag-purple',
  blue: 'ptag-blue',
  pink: 'ptag-pink',
  gold: 'ptag-gold'
};

// 为玩家卡片富化字段（cardState/isLeader/voteType/tags[]）
function enrichTablePlayer(p, ctx) {
  const {
    leaderOpenId, myOpenId, hostOpenId, lakeHolderOpenId,
    preNominatedTeam, nominatedTeam, teamVotes, currentPhase
  } = ctx;

  let cardState = '';
  if ((nominatedTeam || []).includes(p.openId)) cardState = 'state-pre';
  else if ((preNominatedTeam || []).includes(p.openId)) cardState = 'state-pre';

  // 票型：非 teamVote 阶段且公开时显示（后端已门控 teamVotes）
  let voteType = '';
  if (currentPhase !== 'teamVote') {
    const v = (teamVotes || {})[p.openId];
    if (v === 'approve' || v === 'reject') voteType = v;
  }

  // 标签数组：车主(金) / 我(紫) / 房主(蓝) / 湖仙(粉)，可叠加
  const tags = [];
  if (p.openId === leaderOpenId) tags.push({ text: '车主', cls: TAG_STYLES.gold });
  if (p.openId === myOpenId) tags.push({ text: '我', cls: TAG_STYLES.purple });
  if (p.openId === hostOpenId) tags.push({ text: '房主', cls: TAG_STYLES.blue });
  if (p.openId === lakeHolderOpenId) tags.push({ text: '湖仙', cls: TAG_STYLES.pink });

  return {
    ...p,
    cardState,
    isLeader: p.openId === leaderOpenId,
    voteType,
    tags
  };
}

Page({
  data: {
    roomId: '',
    gameId: '',
    gameState: null,
    playerRole: null,
    playerSide: null,
    roleName: '',
    roleEmoji: '',
    roleDesc: '',
    revealConfirmed: false,
    revealConfirmedCount: 0,
    revealTotalCount: 0,
    currentPhase: '',
    currentRound: 1,
    teamLeaderOpenId: '',
    allPlayers: [],
    tablePlayers: [],
    centerPhase: '',
    phaseText: '',
    lastMissionResult: false,
    isTeamLeader: false,
    requiredTeamSize: 0,
    voteCount: 0,
    playerTotal: 0,
    isMissionTeamMember: false,
    hasMissionVoted: false,
    canAssassinateVar: false,
    gameWinner: '',
    nominatedTeam: [],
    teamVotes: {},
    missionVotes: {},
    teamVoteStatus: null,
    missionVoteStatus: null,
    missionResults: [],
    forcedSend: false,
    vision: null,
    gameResult: null,
    playerId: '',
    isHost: false,
    speakingOrder: 'asc',
    speakingOrderIndex: 0,
    speakingOrderConfirmed: false,
    preStepDone: false,
    directionStepDone: false,
    speakingOrderOptions: [{ label: '按座位号从1号开始', value: 'asc' }, { label: '从队长开始逆序', value: 'desc' }],
    showRoleModal: false,
    showRolePage: false,
    showRoleMask: false,
    roleWaiting: false,
    showInfoModal: false,
    showVoteModal: false,
    showMissionModal: false,
    userInfo: null,

    failedNominations: 0,
    maxFailedNominations: 3,
    carIndex: 1,
    lakeHolderOpenId: '',
    preNominatedTeam: [],
    timerSeconds: 0,
    timerRunning: false,
    roomConfigVal: null,
    carsHistory: [],
    lakeHistory: [],
    lancelotSwaps: [],
    roundList: [],
    flowCars: [],
    visionList: [],
    nominateMode: 'final',
  },

  onLoad(options) {
    const { roomId, gameId } = options;
    if (!gameId) {
      // 无有效 gameId（如游戏已结束/房间重置后误入），回退到房间页
      wx.showToast({ title: '游戏不存在或已结束', icon: 'none' });
      setTimeout(() => {
        if (roomId) {
          wx.redirectTo({ url: `/pages/room/room?roomId=${roomId}` });
        } else {
          wx.navigateBack();
        }
      }, 800);
      return;
    }
    this.setData({
      roomId: roomId || '',
      gameId: gameId || '',
      playerId: app.globalData.openId || '',
      userInfo: app.globalData.userInfo,
    });

    api.onSocketMessage('gameUpdated', () => { this.fetchGameState(); });
    api.connectSocket(roomId || '', app.globalData.openId);
    this.initGamePolling();
  },

  onShow() {
    this.fetchGameState();
    if (!api._socketTask && this.data.roomId) {
      api.connectSocket(this.data.roomId, app.globalData.openId);
      api.onSocketMessage('gameUpdated', () => { this.fetchGameState(); });
    }
  },

  onHide() {},

  onUnload() {
    if (this.gamePolling) clearInterval(this.gamePolling);
    this._stopTimer();
    api.disconnectSocket();
  },

  initGamePolling() {
    this.gamePolling = setInterval(() => { this.fetchGameState(); }, 5000);
  },

  fetchGameState() {
    const { gameId } = this.data;
    api.getGameState(gameId).then(res => {
      if (res.success && res.current) {
        const phase = res.current.phase || 'roleReveal';
        const round = res.current.round || 1;
        const myOpenId = app.globalData.openId || '';
        const isHost = !!(res.players || []).some(p => p.openId === myOpenId && p.isHost);
        const isLeader = !!res.current.teamLeaderOpenId && res.current.teamLeaderOpenId === myOpenId;
        const keepLocal = phase === 'discussion' && isLeader;

        if (this.data.currentRound !== round) this._discussionSaved = false;
        if (phase !== 'discussion') this._discussionSaved = false;

        const missions = res.history ? res.history.missions || [] : [];
        const roundList = [];
        for (let i = 1; i <= 5; i++) {
          const m = missions.find(x => x.round === i);
          let status = 'todo';
          if (m) status = m.success ? 'succ' : 'fail';
          roundList.push({ round: i, status, isCurrent: i === round });
        }

        const maxFailed = (res.basic && res.basic.roomConfig && res.basic.roomConfig.rules && res.basic.roomConfig.rules.maxFailedNominations) || 3;
        const failed = res.current.failedNominations || 0;
        const total = maxFailed + 1;
        const forcedSend = !!res.current.forcedSend;
        const flowCars = [];
        for (let i = 1; i <= total; i++) {
          let state = 'pending';
          if (i <= failed) state = 'failed';
          else if (i === failed + 1) state = 'current';
          flowCars.push({ index: i, state, isLast: i === total });
        }
        if (forcedSend) {
          flowCars[total - 1].state = 'current';
          flowCars[total - 1].isForced = true;
        }

        const vp = res.player && res.player.vision ? res.player.vision.players || [] : [];
        const visionList = vp.map(v => {
          const np = (res.players || []).find(x => x.openId === v.openId);
          return {
            openId: v.openId,
            name: np ? np.nickName : '?',
            avatar: np && np.avatarUrl ? np.avatarUrl : '/images/default-avatar.png',
            role: v.role || null,
            side: v.side || null,
            roleText: v.role ? this.getRoleName(v.role) : '',
            campText: v.side ? (v.side === 'evil' ? '坏人' : '好人') : ''
          };
        });

        const myRole = res.player ? res.player.role : null;
        // 长桌玩家富化（预计算 cardState/isLeader/voteType/标签，避免 wxml 函数调用）
        const hostOpenId = (res.players || []).find(p => p.isHost) ? (res.players || []).find(p => p.isHost).openId : '';
        const tablePlayers = (res.players || []).map(p => enrichTablePlayer(p, {
          leaderOpenId: res.current.teamLeaderOpenId || '',
          myOpenId: myOpenId,
          hostOpenId,
          lakeHolderOpenId: res.current.lakeHolderOpenId || '',
          preNominatedTeam: res.current.preNominatedTeam || [],
          nominatedTeam: res.current.nominatedTeam || [],
          teamVotes: res.current.teamVotes || {},
          currentPhase: phase
        }));
        this.setData({
          gameState: res.current,
          playerRole: myRole,
          playerSide: res.player ? res.player.side : null,
          roleName: this.getRoleName(myRole),
          roleEmoji: this.getRoleEmoji(myRole),
          roleDesc: this.getRoleDesc(myRole),
          currentPhase: phase,
          currentRound: round,
          teamLeaderOpenId: res.current.teamLeaderOpenId || '',
          nominatedTeam: (keepLocal && !this._discussionSaved) ? this.data.nominatedTeam : (res.current.nominatedTeam || []),
          preNominatedTeam: (keepLocal && !this._discussionSaved) ? this.data.preNominatedTeam : (res.current.preNominatedTeam || []),
          teamVotes: res.current.teamVotes || {},
          missionVotes: res.current.missionVotes || {},
          missionResults: missions,
          forcedSend: forcedSend,
          failedNominations: failed,
          maxFailedNominations: maxFailed,
          carIndex: res.current.index || 1,
          lakeHolderOpenId: res.current.lakeHolderOpenId || '',
          revealConfirmed: res.player ? !!res.player.revealConfirmed : false,
          revealConfirmedCount: res.current.revealConfirmedCount || 0,
          revealTotalCount: res.current.revealTotalCount || 0,
          vision: res.player ? res.player.vision || null : null,
          visionList: visionList,
          allPlayers: res.players || [],
          tablePlayers: tablePlayers,
          teamVoteStatus: res.current.teamVoteStatus || null,
          missionVoteStatus: res.current.missionVoteStatus || null,
          roomConfigVal: res.basic && res.basic.roomConfig ? res.basic.roomConfig : null,
          gameResult: res.basic && res.basic.result ? res.basic.result : null,
          isHost: isHost,
          carsHistory: res.history ? res.history.cars || [] : [],
          lakeHistory: res.history ? res.history.lake || [] : [],
          lancelotSwaps: res.history ? res.history.lancelotSwaps || [] : [],
          speakingOrder: keepLocal ? this.data.speakingOrder : (res.current.speakingOrder || 'asc'),
          speakingOrderIndex: keepLocal ? this.data.speakingOrderIndex : ((res.current.speakingOrder || 'asc') === 'desc' ? 1 : 0),
          speakingOrderConfirmed: this._discussionSaved || !!res.current.discussionSet,
          roundList: roundList,
          flowCars: flowCars,
          centerPhase: this.centerPhaseText(),
          phaseText: this.getPhaseText(phase),
          lastMissionResult: !!(missions.length > 0 && missions[missions.length - 1].success),
          isTeamLeader: !!res.current.teamLeaderOpenId && res.current.teamLeaderOpenId === myOpenId,
          requiredTeamSize: this.getRequiredTeamSize(),
          voteCount: Object.keys(res.current.teamVotes || {}).length,
          playerTotal: (res.players || []).length,
          isMissionTeamMember: !!((res.current.nominatedTeam || []).includes(myOpenId)),
          hasMissionVoted: !!(res.current.missionVotes && res.current.missionVotes[myOpenId]),
          canAssassinateVar: ['assassin', 'morgana'].includes(myRole),
          gameWinner: res.basic && res.basic.result && res.basic.result.winner ? res.basic.result.winner : (missions.filter(r => r.success).length >= 3 ? 'good' : 'evil'),
        });

        if (phase === 'gameEnd') {
          this.showGameEndResult(res.basic ? res.basic.result : null);
        }

        // 全员确认后进入 discussion：关闭身份页/蒙版，正式进入游戏
        if (phase === 'discussion') {
          this.setData({ showRoleModal: false, showRolePage: false, showRoleMask: false, roleWaiting: false });
          this._ensureTimerInit();
        } else {
          this._stopTimer();
        }
        if (phase === 'roleReveal' && res.player && res.player.role && !this.data.revealConfirmed) {
          // roleReveal 未确认：展示蒙版；已点击确认（roleWaiting）则保持身份页等待，不再弹蒙版
          this.setData({ showRoleMask: !this.data.roleWaiting });
          // 禁用返回手势：roleReveal 未确认时必须点按钮才能继续
          if (wx.enableAlertBeforeUnload) {
            wx.enableAlertBeforeUnload({ message: '是否暂时挂起游戏回到首页？' });
          }
        } else {
          this.setData({ showRoleMask: false });
          if (wx.disableAlertBeforeUnload) {
            wx.disableAlertBeforeUnload();
          }
        }
      }
    }).catch(err => {
      console.error('获取游戏状态失败:', err);
    });
  },

  noop() {},

  confirmRoleReveal() {
    const { gameId } = this.data;
    api.confirmReveal(gameId).then(res => {
      // 确认成功：进入等待状态——保持身份页，隐藏按钮，显示紫色加载
      this.setData({ roleWaiting: true, showRoleMask: false });
      this.fetchGameState();
      if (res && res.current && res.current.phase === 'discussion') {
        // 已是最后确认者，全员确认完成 → 进入 discussion
        this.setData({ showRolePage: false, showRoleModal: false });
        wx.showToast({ title: '全员已确认，进入讨论', icon: 'success' });
      }
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '确认失败', icon: 'none' });
    });
  },

  // 蒙版"查看身份" → 打开全屏 confirmReveal 页（roleReveal 阶段）
  dismissRoleMask() {
    wx.setStorageSync('avalon_roleMask_' + this.data.gameId, true);
    this.setData({ showRoleMask: false });
    this.openRolePage();
  },

  // 全屏 confirmReveal 页（roleReveal 阶段确认身份用）
  openRolePage() {
    if (!this.data.playerRole) return;
    this.setData({ showRolePage: true, showRoleModal: false });
  },

  // 查看身份：roleReveal 用全屏确认页，其他阶段用标准弹窗
  openRoleModal() {
    if (!this.data.playerRole) return;
    if (this.data.currentPhase === 'roleReveal') {
      this.setData({ showRolePage: true, showRoleModal: false });
    } else {
      this.setData({ showRoleModal: true, showRolePage: false });
    }
  },

  // 标准弹窗"隐藏身份"：仅关闭，不触发确认，不自动消失
  closeRoleModal() {
    this.setData({ showRoleModal: false });
  },

  // 全屏页"隐藏身份"（若 roleReveal 未确认则触发确认）
  closeRolePage() {
    if (this.data.currentPhase === 'roleReveal' && !this.data.revealConfirmed) {
      this.confirmRoleReveal();
    } else {
      this.setData({ showRolePage: false });
    }
  },

  backToHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  openInfoModal() {
    this.setData({ showInfoModal: true });
  },

  closeInfoModal() {
    this.setData({ showInfoModal: false });
  },

  showGameEndResult(gameResult) {
    if (gameResult) {
      const winnerText = gameResult.winner === 'good' ? '好人获胜' : '坏人获胜';
      wx.showModal({
        title: '游戏结束',
        content: `${winnerText}\n原因: ${gameResult.reason}`,
        showCancel: false,
        confirmText: '确定',
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  nominatePlayer(e) {
    if (!this.checkIfTeamLeader()) return;
    if (this.data.speakingOrderConfirmed) return;
    const playerId = e.currentTarget.dataset.id;
    // 讨论阶段第一步：预选车型（任意人数，点选/取消）
    const pre = this.data.preNominatedTeam.slice();
    const i = pre.indexOf(playerId);
    if (i === -1) pre.push(playerId); else pre.splice(i, 1);
    this.setData({ preNominatedTeam: pre });
  },

  // 第一步完成：提交预选车型（本地锁定，不落库）
  submitPreNomination() {
    if (!this.checkIfTeamLeader()) return;
    this.setData({ preStepDone: true });
    // 若方向也已选择，则两步齐全 → 统一提交
    if (this.data.directionStepDone) {
      this.commitDiscussionSettings();
    } else {
      wx.showToast({ title: '预选车型已提交，请选择发言方向', icon: 'none' });
    }
  },

  // 回退第一步（允许重新选择预选车型；未落库前可回退）
  undoPreNomination() {
    if (this.data.speakingOrderConfirmed) return;
    this.setData({ preStepDone: false, directionStepDone: false });
  },

  // 第二步：点击方向按钮立即选择（asc=↑ 顺序 / desc=↓ 逆序），两步齐全后统一提交
  selectSpeakingDirection(e) {
    if (!this.checkIfTeamLeader()) return;
    const order = e.currentTarget.dataset.order;
    if (!['asc', 'desc'].includes(order)) return;
    this.setData({
      speakingOrder: order,
      speakingOrderIndex: order === 'desc' ? 1 : 0,
      directionStepDone: true
    });
    // 两步都完成 → 统一调用 setDiscussion 落库
    if (this.data.preStepDone && order) {
      this.commitDiscussionSettings();
    }
  },

  // 统一提交：预选车型 + 发言方向一次落库
  commitDiscussionSettings() {
    const { gameId, speakingOrder, preNominatedTeam } = this.data;
    wx.showLoading({ title: '提交中...', mask: true });
    api.setDiscussion(gameId, speakingOrder, preNominatedTeam).then(() => {
      wx.hideLoading();
      this._discussionSaved = true;
      this.fetchGameState();
      wx.showToast({ title: '发言设置已提交', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    });
  },

  getRequiredTeamSize() {
    const playerCount = this.data.allPlayers?.length || 5;
    const round = this.data.currentRound;
    const sizes = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
      11: [3, 4, 5, 6, 6],
      12: [3, 4, 5, 6, 6],
    };
    return sizes[playerCount]?.[round - 1] || 3;
  },

  confirmNomination() {
    const { gameId, preNominatedTeam, forcedSend } = this.data;
    if (!this.data.speakingOrderConfirmed) {
      wx.showToast({ title: '请先完成预选车型与发言方向', icon: 'none' });
      return;
    }
    const requiredSize = this.getRequiredTeamSize();
    if (preNominatedTeam.length !== requiredSize) {
      wx.showToast({ title: `预选车型需 ${requiredSize} 人（当前${preNominatedTeam.length}）`, icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中...', mask: true });
    api.submitNomination(gameId, preNominatedTeam, forcedSend ? true : undefined).then(res => {
      wx.hideLoading();
      if (res && res.success === false) {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      } else {
        this.fetchGameState();
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    });
  },

  checkIfTeamLeader() {
    const { teamLeaderOpenId } = this.data;
    return !!teamLeaderOpenId && teamLeaderOpenId === app.globalData.openId;
  },

  // 长桌玩家卡片状态类（预选金底 / 发车青底）
  tableCardState(openId) {
    const { preNominatedTeam, nominatedTeam } = this.data;
    if ((nominatedTeam || []).includes(openId)) return 'state-sel';
    if ((preNominatedTeam || []).includes(openId)) return 'state-pre';
    return '';
  },

  // 长桌玩家点击（按阶段分发）
  onTablePlayerTap(e) {
    const { currentPhase } = this.data;
    if (currentPhase === 'discussion') {
      this.nominatePlayer(e);
    } else if (currentPhase === 'assassination') {
      this.assassinate(e);
    }
  },

  // 中间区阶段名文字
  centerPhaseText() {
    const map = {
      roleReveal: '身份',
      discussion: '发言',
      teamVote: '投票',
      missionVote: '任务',
      assassination: '刺杀',
      missionResult: '结果',
      gameEnd: '结束'
    };
    return map[this.data.currentPhase] || this.data.currentPhase;
  },

  // 是否处于投票进行中（用于控制票型显示）
  isVotingPhase() {
    const { currentPhase } = this.data;
    return currentPhase === 'teamVote' || currentPhase === 'missionVote';
  },

  // 队伍投票结束后公开票型（后端 teamVotes 已按 voteVisibility 门控）
  publicVoteOf(openId) {
    const { currentPhase, teamVotes } = this.data;
    if (currentPhase === 'teamVote') return '';          // 投票中不显示
    const v = (teamVotes || {})[openId];
    return v === 'approve' || v === 'reject' ? v : '';
  },

  // ─────── 发言计时器（房主操控，仅 discussion） ───────
  _getSpeechTimeout() {
    const rc = (this.data.gameState && this.data.gameState.roomConfig) || this.data.roomConfigVal;
    const limits = (rc && rc.limits) || {};
    return parseInt(limits.speechTimeout, 10) || 0;
  },
  _ensureTimerInit() {
    if (this.timerInterval) return;
    const sec = this._getSpeechTimeout();
    if (this.data.timerSeconds === 0 && sec > 0) {
      this.setData({ timerSeconds: sec, timerRunning: false });
    }
  },
  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.setData({ timerRunning: false });
  },
  startTimer() {
    if (!this.checkIfTeamLeader()) return;
    if (this.data.timerRunning) return;
    if (this.data.timerSeconds <= 0) {
      const sec = this._getSpeechTimeout();
      if (!sec) { wx.showToast({ title: '未设置发言时限', icon: 'none' }); return; }
      this.setData({ timerSeconds: sec });
    }
    this.setData({ timerRunning: true });
    this.timerInterval = setInterval(() => {
      let s = this.data.timerSeconds - 1;
      if (s <= 0) {
        s = 0;
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.setData({ timerSeconds: s, timerRunning: false });
        wx.showToast({ title: '发言时间到', icon: 'none' });
      } else {
        this.setData({ timerSeconds: s });
      }
    }, 1000);
  },
  pauseTimer() {
    if (!this.checkIfTeamLeader()) return;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.setData({ timerRunning: false });
  },
  resetTimer() {
    if (!this.checkIfTeamLeader()) return;
    this.pauseTimer();
    const sec = this._getSpeechTimeout();
    this.setData({ timerSeconds: sec || 0 });
  },

  castVote(e) {
    const vote = e.currentTarget.dataset.vote;
    const { gameId } = this.data;

    api.castVote(gameId, vote).then(res => {
      console.log('投票成功:', res);
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '投票失败', icon: 'none' });
    });
  },

  castMissionVote(e) {
    const vote = e.currentTarget.dataset.vote;
    const { gameId, playerRole, playerSide } = this.data;

    if (vote === 'fail') {
      // 以当前阵营为准（兰斯洛特转换可能改变 side）；后端为最终裁决
      const isEvil = playerSide === 'evil' || ['mordred', 'morgana', 'assassin', 'minion', 'oberon', 'lancelotRed'].includes(playerRole);
      if (!isEvil) {
        wx.showToast({
          title: '只有坏人才能破坏任务',
          icon: 'error',
        });
        return;
      }
    }

    api.castMissionVote(gameId, vote, playerRole).then(res => {
      console.log('任务投票成功:', res);
    }).catch(err => {
      wx.showToast({ title: (err && err.message) || '任务投票失败', icon: 'none' });
    });
  },

  getLeaderName(openId) {
    const p = (this.data.allPlayers || []).find(x => x.openId === openId);
    return p ? p.nickName : '未知';
  },

  getLakeHolderName() {
    return this.getLeaderName(this.data.lakeHolderOpenId);
  },

  getNamesByIds(ids) {
    return (ids || []).map(id => this.getLeaderName(id)).join('、');
  },

  getApproveCount(votes) {
    return Object.values(votes || {}).filter(v => v === 'approve').length;
  },

  getRejectCount(votes) {
    return Object.values(votes || {}).filter(v => v === 'reject').length;
  },

  getCarOutcome(car) {
    if (!car) return '';
    if (car.outcome === 'reject') return '流车';
    if (car.outcome === 'send') return car.missionSuccess ? '发车成功' : '发车失败';
    return '进行中';
  },

  canAssassinate() {
    // 与后端一致：assassin 或（无 assassin 时）morgana 可发起刺杀
    return ['assassin', 'morgana'].includes(this.data.playerRole);
  },

  assassinate(e) {
    const targetOpenId = e.currentTarget.dataset.id;
    const { gameId } = this.data;
    wx.showModal({
      title: '刺杀梅林',
      content: '确认刺杀该玩家为梅林？',
      success: (res) => {
        if (res.confirm) {
          api.assassinate(gameId, targetOpenId).then(() => {
            this.fetchGameState();
          }).catch(err => {
            wx.showToast({ title: (err && err.message) || '刺杀失败', icon: 'none' });
          });
        }
      }
    });
  },

  abandonGame() {
    const { gameId } = this.data;
    wx.showModal({
      title: '放弃游戏',
      content: '确定放弃本局游戏吗？此操作无胜负结果。',
      success: (res) => {
        if (res.confirm) {
          api.abandonGame(gameId).then(() => {
            wx.navigateBack();
          }).catch(err => {
            wx.showToast({ title: (err && err.message) || '放弃失败', icon: 'none' });
          });
        }
      }
    });
  },

  endGame() {
    wx.showModal({
      title: '结束游戏',
      content: '确定要结束游戏吗？',
      success: (res) => {
        if (res.confirm) {
          api.endGame(this.data.gameId).then(() => {
            wx.navigateBack();
          }).catch(err => {
            console.error('结束游戏失败:', err);
          });
        }
      }
    });
  },

  getPhaseText(phase) {
    const phaseMap = {
      'roleReveal': '角色揭示',
      'discussion': '讨论阶段',
      'teamVote': '队伍投票',
      'missionVote': '任务投票',
      'missionResult': '任务结果',
      'gameEnd': '游戏结束'
    };
    return phaseMap[phase] || phase;
  },

  getMissionProgress() {
    const successful = this.countSuccessfulMissions();
    return Math.floor((successful / 3) * 100);
  },

  countSuccessfulMissions() {
    return (this.data.missionResults || []).filter(r => r.success).length;
  },

  getTeamLeaderName() {
    const { allPlayers, teamLeaderOpenId } = this.data;
    if (!allPlayers || !teamLeaderOpenId) return '未知';
    const leader = allPlayers.find(p => p.openId === teamLeaderOpenId);
    return leader ? leader.nickName : '未知';
  },

  getNominatedPlayers() {
    const { allPlayers, nominatedTeam } = this.data;
    if (!allPlayers || !nominatedTeam) return [];

    return allPlayers.filter(player =>
      nominatedTeam.includes(player.openId)
    );
  },

  // 当前玩家是否在任务队上（决定是否显示任务投票按钮）
  isOnMissionTeam() {
    const { nominatedTeam, playerId } = this.data;
    return !!(nominatedTeam || []).includes(playerId);
  },

  // 当前玩家是否已提交任务投票
  hasMissionVoted() {
    const { missionVotes, playerId } = this.data;
    return !!(missionVotes && missionVotes[playerId]);
  },

  getVoteCount() {
    return Object.keys(this.data.teamVotes || {}).length;
  },

  getLastMissionResult() {
    const { missionResults } = this.data;
    if (!missionResults || missionResults.length === 0) return null;
    return missionResults[missionResults.length - 1].success;
  },

  getGameWinner() {
    const r = this.data.gameResult;
    if (r && r.winner) return r.winner;
    const successful = this.countSuccessfulMissions();
    if (successful >= 3) return 'good';
    return 'evil';
  },

  getPlayerSide(role) {
    const goodRoles = ['merlin', 'percival', 'loyal', 'lancelotBlue', 'ladyOfTheLake'];
    return goodRoles.includes(role) ? 'good' : 'evil';
  },

  getRoleName(role) {
    const roleNames = {
      'merlin': '梅林',
      'percival': '派西维尔',
      'loyal': '忠臣',
      'mordred': '莫德雷德',
      'morgana': '莫甘娜',
      'assassin': '刺客',
      'minion': '爪牙',
      'oberon': '奥伯伦',
      'lancelotBlue': '蓝兰',
      'lancelotRed': '红兰'
    };
    return roleNames[role] || '未知';
  },

  getRoleEmoji(role) {
    const emojis = {
      'merlin': '🔮',
      'percival': '🛡️',
      'loyal': '🧑‍🌾',
      'mordred': '🌑',
      'morgana': '🌙',
      'assassin': '🗡️',
      'minion': '🐺',
      'oberon': '👤',
      'lancelotBlue': '🔵',
      'lancelotRed': '🔴'
    };
    return emojis[role] || '🎴';
  },

  getRoleDesc(role) {
    const roleDesc = {
      'merlin': '知道所有坏人（除莫德雷德），需要隐藏身份',
      'percival': '知道梅林和莫甘娜，需要保护梅林',
      'loyal': '好人阵营，不知道其他角色身份',
      'mordred': '坏人，梅林看不到他',
      'morgana': '坏人，假扮梅林迷惑派西维尔',
      'assassin': '坏人，游戏结束时可以刺杀梅林',
      'minion': '坏人，帮助破坏任务',
      'oberon': '坏人，不知道其他坏人身份，坏人看不到他',
      'lancelotBlue': '蓝兰，好人阵营兰斯洛特，可能被换阵营',
      'lancelotRed': '红兰，坏人阵营兰斯洛特，可能被换阵营'
    };
    return roleDesc[role] || '角色信息错误';
  },
});
