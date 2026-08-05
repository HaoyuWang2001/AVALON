// pages/game/game.js
const app = getApp();
const api = require('../../services/api.js');

// 睁眼狼（刺杀阶段向所有玩家暴露身份）
const EVIL_OPEN_EYES = ['morgana', 'assassin', 'minion', 'mordred'];

// 角色中文名（模块级，供富化函数使用）
const ROLE_NAMES_LOCAL = {
  merlin: '梅林', percival: '派西维尔', loyal: '忠臣', mordred: '莫德雷德',
  morgana: '莫甘娜', assassin: '刺客', minion: '爪牙', oberon: '奥伯伦',
  lancelotBlue: '蓝兰', lancelotRed: '红兰'
};
function getRoleNameLocal(role) {
  return ROLE_NAMES_LOCAL[role] || '未知';
}

// 标准标签配色：浅紫底深紫字 / 浅蓝底蓝字 / 浅粉底粉字 / 浅金底金字 / 浅橙底橙字
const TAG_STYLES = {
  purple: 'ptag-purple',
  blue: 'ptag-blue',
  pink: 'ptag-pink',
  gold: 'ptag-gold',
  orange: 'ptag-orange',
  red: 'ptag-red',
  grey: 'ptag-pink-deep'
};

// 为玩家卡片富化字段（checked/cardState/disabled/isLeader/tags[]）
function enrichTablePlayer(p, ctx) {
  const {
    leaderOpenId, myOpenId, hostOpenId, lakeHolderOpenId, oldLakeOpenIds,
    preNominatedTeam, nominatedTeam, localSelected, teamVotes, teamVoteStatus, currentPhase,
    requiredTeamSize, evilOpenEyes
  } = ctx;

  // 复选框勾选：本地临时选中（preNominate/discussion 车主选车）
  const checked = !!(localSelected || []).includes(p.openId);
  // discussion 确认发车：已选满 requiredTeamSize 后，未选玩家复选框禁用（已选的可取消）
  const atLimit = (localSelected || []).length >= (requiredTeamSize || 0);
  const disabled = currentPhase === 'discussion' && atLimit && !checked;

  // 刺杀阶段：睁眼狼淡红背景 + 角色名标签
  const isEvilEyes = currentPhase === 'assassination'
    && !!(evilOpenEyes || []).some(e => e.openId === p.openId);

  // 车队/投票渐变状态：
  //  teamVote：车队=右半金渐变，已投=左半紫渐变，可叠加
  //  missionVote：左半绿=赞成/红=反对（队伍投票结果），车队右半金渐变保留
  let cardState = '';
  if (isEvilEyes) {
    cardState = 'state-evil';
  } else if (currentPhase === 'teamVote' || currentPhase === 'missionVote') {
    const inTeam = !!(nominatedTeam || []).includes(p.openId);
    if (currentPhase === 'teamVote') {
      const voted = (teamVoteStatus || {})[p.openId] === 'voted';
      if (inTeam && voted) cardState = 'state-team-voted';
      else if (inTeam) cardState = 'state-team';
      else if (voted) cardState = 'state-voted';
    } else if (currentPhase === 'missionVote') {
      // 队伍投票结果公开：左半绿=赞成 / 红=反对；车队右半金色保留
      const vote = (teamVotes || {})[p.openId];
      if (inTeam && vote === 'approve') cardState = 'state-team-approved';
      else if (inTeam && vote === 'reject') cardState = 'state-team-rejected';
      else if (vote === 'approve') cardState = 'state-approved';
      else if (vote === 'reject') cardState = 'state-rejected';
      else if (inTeam) cardState = 'state-team';
    }
  } else if (currentPhase === 'gameEnd') {
    // 游戏结束：按阵营着色（仅判断 side）
    cardState = p.side === 'evil' ? 'state-gameend-evil' : 'state-gameend-good';
  }

  // 游戏结束：全员身份名（右侧徽标）
  const roleName = currentPhase === 'gameEnd' ? getRoleNameLocal(p.role) : '';

  // 标签数组：车主(金) / 我(紫) / 房主(蓝) / 湖仙(粉) / 预选(橙) / 睁眼狼角色(红)，可叠加
  const tags = [];
  let evilRoleName = '';
  if (isEvilEyes) {
    const evil = (evilOpenEyes || []).find(e => e.openId === p.openId);
    if (evil && evil.role) evilRoleName = getRoleNameLocal(evil.role);
  }
  if (p.openId === leaderOpenId) tags.push({ text: '车主', cls: TAG_STYLES.gold });
  if (p.openId === myOpenId) tags.push({ text: '我', cls: TAG_STYLES.purple });
  if (p.openId === hostOpenId) tags.push({ text: '房主', cls: TAG_STYLES.blue });
  if (p.openId === lakeHolderOpenId) tags.push({ text: '湖仙', cls: TAG_STYLES.pink });
  // 老湖仙：已被查验过（曾持有湖仙令牌）的玩家，非当前持有者；整局持续，且不可再被查验
  const isOldLake = !!(oldLakeOpenIds && oldLakeOpenIds.has(p.openId));
  if (isOldLake && p.openId !== lakeHolderOpenId) {
    tags.push({ text: '老湖仙', cls: TAG_STYLES.grey });
  }
  // 车主确认预选后（speakingOrder/discussion 阶段）展示预选队伍成员
  if ((currentPhase === 'speakingOrder' || currentPhase === 'discussion')
      && (preNominatedTeam || []).includes(p.openId)) {
    tags.push({ text: '预选', cls: TAG_STYLES.orange });
  }

  return {
    ...p,
    checked,
    cardState,
    disabled,
    isLeader: p.openId === leaderOpenId,
    isOldLake,
    evilRoleName,
    roleName,
    tags
  };
}

// 队伍人数表（按玩家数与轮次）
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [3, 4, 5, 6, 6],
  12: [3, 4, 5, 6, 6],
};
function getTeamSizeByRound(playerCount, round) {
  return (TEAM_SIZES[playerCount] || TEAM_SIZES[5])[round - 1] || 3;
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
    hasTeamVoted: false,
    canAssassinateVar: false,
    gameWinner: '',
    evilOpenEyes: [],
    nominatedTeam: [],
    teamVotes: {},
    approveSeats: '',
    rejectSeats: '',
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
    lancelotResult: null,
    lancelotConfirmedCount: 0,
    lancelotTotalCount: 0,
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
    localSelected: [],
    preTeamSeats: '',
    timerSeconds: 0,
    timerRunning: false,
    hasSpeechTimeout: false,
    roomConfigVal: null,
    carsHistory: [],
    lakeHistory: [],
    lancelotSwaps: [],
    roundList: [],
    flowCars: [],
    visionList: [],
    nominateMode: 'final',
    showSelectCheck: false,
    bottomBarHeight: 0,
    lakeTargetOpenId: '',
    isLakeHolder: false,
    showLakeResult: false,
    lakeResult: '',
    oldLakeOpenIds: [],
    socketReconnecting: false,
    isEvilEyesUser: false,
    gameAssassination: null,
    showAssassinationAnim: false,
    assassinationSuccess: false,
    assassinationPhase: '',
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
    api.onSocketMessage('gameState', () => { this.fetchGameState(); });
    api.onSocketStatus(status => { this.onSocketStatusChange(status); });
  },

  onShow() {
    this.fetchGameState();
  },

  onHide() {},

  onUnload() {
    this._stopTimer();
    if (this._assnAnimTimer) clearTimeout(this._assnAnimTimer);
    if (this._assnAnimTimer2) clearTimeout(this._assnAnimTimer2);
    api.disconnectSocket();
  },

  // 下拉刷新：强制 HTTP fetch 恢复（活跃对局服务端不可达/断链时手动恢复）
  onPullDownRefresh() {
    this.fetchGameState().finally(() => wx.stopPullDownRefresh());
  },

  // socket 连接状态变化：断链→显示重连 loading；恢复→隐藏并同步一次状态
  onSocketStatusChange(status) {
    if (status === 'open') {
      this.setData({ socketReconnecting: false });
      this.fetchGameState();
    } else if (status === 'closed') {
      this.setData({ socketReconnecting: true });
    }
    // 'connecting' 不改变状态，避免初始加载与重连中途闪烁
  },

  fetchGameState() {
    const { gameId } = this.data;
    return api.getGameState(gameId).then(res => {
      if (res.success && res.current) {
        const phase = res.current.phase || 'roleReveal';
        const round = res.current.round || 1;
        const myOpenId = app.globalData.openId || '';
        const isHost = !!(res.players || []).some(p => p.openId === myOpenId && p.isHost);
        const isLeader = !!res.current.teamLeaderOpenId && res.current.teamLeaderOpenId === myOpenId;
        // round 或 index(failedNominations) 更新时清空本地选中
        const failed = res.current.failedNominations || 0;
        const shouldResetLocal = this.data.currentRound !== round || this.data.failedNominations !== failed;
        const effectiveLocal = shouldResetLocal ? [] : (this.data.localSelected || []);

        const missions = res.history ? res.history.missions || [] : [];
        const roundList = [];
        for (let i = 1; i <= 5; i++) {
          const m = missions.find(x => x.round === i);
          let status = 'todo';
          if (m) status = m.success ? 'succ' : 'fail';
          roundList.push({
            round: i,
            status,
            isCurrent: i === round,
            size: getTeamSizeByRound((res.players || []).length, i)
          });
        }

        const maxFailed = (res.basic && res.basic.roomConfig && res.basic.roomConfig.rules && res.basic.roomConfig.rules.maxFailedNominations) || 3;
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
            seat: np && np.seatNumber != null ? np.seatNumber : null,
            name: np ? np.nickName : '?',
            avatar: np && np.avatarUrl ? np.avatarUrl : '/images/default-avatar.png',
            role: v.role || null,
            side: v.side || null,
            roleText: v.role ? this.getRoleName(v.role) : '',
            campText: v.side ? (v.side === 'evil' ? '坏人' : '好人') : ''
          };
        });

        const myRole = res.player ? res.player.role : null;
        // 预选车成员座位号（底部框信息行，基于后端 preNominatedTeam 展示，空格分隔）
        const preTeamSeats = (res.current.preNominatedTeam || []).map(id => {
          const p = (res.players || []).find(x => x.openId === id);
          return p ? String(p.seatNumber) : '?';
        }).join(' ');
        // 队伍投票结果（missionVote 及之后公开）：赞成/反对座位号（按座位号正序）
        const tv = res.current.teamVotes || {};
        const seatOf = id => {
          const p = (res.players || []).find(x => x.openId === id);
          return p ? String(p.seatNumber) : '?';
        };
        const seatNumOf = id => {
          const p = (res.players || []).find(x => x.openId === id);
          return p ? (p.seatNumber || 999) : 999;
        };
        const approveSeats = Object.keys(tv)
          .filter(id => tv[id] === 'approve')
          .sort((a, b) => seatNumOf(a) - seatNumOf(b))
          .map(seatOf).join(' ');
        const rejectSeats = Object.keys(tv)
          .filter(id => tv[id] === 'reject')
          .sort((a, b) => seatNumOf(a) - seatNumOf(b))
          .map(seatOf).join(' ');
        // 当前轮队伍人数（用本轮 round 局部变量，避免 setData 异步读旧 currentRound）
        const teamSize = getTeamSizeByRound((res.players || []).length, round);
        // 老湖仙集合：持有过湖仙令牌的玩家（验人者 inspector ∪ 被查验者 target），
        // 首位持有者作为验人者也在集合内；与后端 exhausted 逻辑一致
        const oldLakeOpenIds = new Set();
        (res.history ? res.history.lake || [] : []).forEach(e => {
          oldLakeOpenIds.add(e.inspectorOpenId);
          oldLakeOpenIds.add(e.targetOpenId);
        });
        // 长桌玩家富化（预计算 checked/cardState/标签，避免 wxml 函数调用）
        const hostOpenId = (res.players || []).find(p => p.isHost) ? (res.players || []).find(p => p.isHost).openId : '';
        const tablePlayers = (res.players || []).map(p => enrichTablePlayer(p, {
          leaderOpenId: res.current.teamLeaderOpenId || '',
          myOpenId: myOpenId,
          hostOpenId,
          lakeHolderOpenId: res.current.lakeHolderOpenId || '',
          oldLakeOpenIds,
          preNominatedTeam: res.current.preNominatedTeam || [],
          nominatedTeam: res.current.nominatedTeam || [],
          localSelected: effectiveLocal,
          teamVotes: res.current.teamVotes || {},
          teamVoteStatus: res.current.teamVoteStatus || null,
          requiredTeamSize: teamSize,
          evilOpenEyes: res.current.evilOpenEyes || [],
          currentPhase: phase
        }));

        // 历史记录预计算（全部用座位号，避免 wxml 函数调用）
        const nameSeat = id => {
          const p = (res.players || []).find(x => x.openId === id);
          return p ? String(p.seatNumber) : '?';
        };
        // 座位信息：{seat, isMe}，供游戏记录中高亮自己的座位号
        const meSeatNum = (() => {
          const me = (res.players || []).find(x => x.openId === myOpenId);
          return me ? me.seatNumber : null;
        })();
        const seatInfo = id => {
          const p = (res.players || []).find(x => x.openId === id);
          const seat = p ? p.seatNumber : '?';
          return { seat, isMe: typeof seat === 'number' && meSeatNum != null && seat === meSeatNum };
        };
        const buildCar = (car) => {
          const tv = car.teamVotes || {};
          return {
            ...car,
            forced: car.index === maxFailed + 1,
            leaderSeat: seatInfo(car.teamLeaderOpenId),
            sendSeats: (car.nominatedTeam || []).map(seatInfo),
            approveSeats: Object.keys(tv).filter(id => tv[id] === 'approve').map(seatInfo),
            rejectSeats: Object.keys(tv).filter(id => tv[id] === 'reject').map(seatInfo),
            outcomeText: car.outcome === 'reject' ? '流车'
              : (car.missionSuccess == null ? '未进行任务'
              : (car.missionSuccess ? '任务成功' : '任务失败'))
          };
        };
        const carsHistory = (res.history ? res.history.cars || [] : []).map(r => ({ ...r, details: (r.details || []).map(buildCar) }));
        const lakeHistory = (res.history ? res.history.lake || [] : []).map(e => ({
          ...e,
          inspectorSeat: seatInfo(e.inspectorOpenId),
          targetSeat: seatInfo(e.targetOpenId)
        }));

        // 刺杀链路：仅刺杀结算时有 assassination 记录
        const asn = res.basic && res.basic.result && res.basic.result.assassination;
        let gameAssassination = null;
        if (asn) {
          const tp = (res.players || []).find(x => x.openId === asn.target);
          gameAssassination = {
            targetSeat: tp ? tp.seatNumber : '?',
            correct: !!asn.correct
          };
        }

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
          nominatedTeam: res.current.nominatedTeam || [],
          preNominatedTeam: res.current.preNominatedTeam || [],
          localSelected: effectiveLocal,
          preTeamSeats: preTeamSeats,
          approveSeats: approveSeats,
          rejectSeats: rejectSeats,
          teamVotes: res.current.teamVotes || {},
          missionVotes: res.current.missionVotes || {},
          missionResults: missions,
          forcedSend: forcedSend,
          failedNominations: failed,
          maxFailedNominations: maxFailed,
          carIndex: res.current.index || 1,
          lakeHolderOpenId: res.current.lakeHolderOpenId || '',
          isLakeHolder: !!res.current.lakeHolderOpenId && res.current.lakeHolderOpenId === myOpenId,
          lakeTargetOpenId: phase === 'lake' ? this.data.lakeTargetOpenId : '',
          oldLakeOpenIds: [...oldLakeOpenIds],
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
          carsHistory: carsHistory,
          lakeHistory: lakeHistory,
          lancelotSwaps: res.history ? res.history.lancelotSwaps || [] : [],
          speakingOrder: res.current.speakingOrder || 'asc',
          speakingOrderIndex: (res.current.speakingOrder || 'asc') === 'desc' ? 1 : 0,
          speakingOrderConfirmed: !!res.current.discussionSet,
          lancelotResult: res.current.lancelotResult || null,
          lancelotConfirmedCount: res.current.lancelotConfirmedCount || 0,
          lancelotTotalCount: res.current.lancelotTotalCount || 0,
          roundList: roundList,
          flowCars: flowCars,
          centerPhase: this.centerPhaseText(),
          phaseText: this.getPhaseText(phase),
          lastMissionResult: !!(missions.length > 0 && missions[missions.length - 1].success),
          isTeamLeader: !!res.current.teamLeaderOpenId && res.current.teamLeaderOpenId === myOpenId,
          requiredTeamSize: teamSize,
          showSelectCheck: (phase === 'preNominate' || phase === 'discussion') && !!res.current.teamLeaderOpenId && res.current.teamLeaderOpenId === myOpenId,
          voteCount: Object.keys(res.current.teamVotes || {}).length,
          playerTotal: (res.players || []).length,
          isMissionTeamMember: !!((res.current.nominatedTeam || []).includes(myOpenId)),
          hasMissionVoted: !!(res.current.missionVotes && res.current.missionVotes[myOpenId]),
          hasTeamVoted: !!(res.current.teamVoteStatus && res.current.teamVoteStatus[myOpenId] === 'voted'),
          canAssassinateVar: ['assassin', 'morgana'].includes(myRole),
          evilOpenEyes: res.current.evilOpenEyes || [],
          isEvilEyesUser: (res.current.evilOpenEyes || []).some(e => e.openId === myOpenId),
          gameWinner: (res.basic && res.basic.result && res.basic.result.winner) || null,
          gameAssassination: gameAssassination,
          hasSpeechTimeout: this._getSpeechTimeout() > 0,
        });

        // 底部栏高度随阶段动态变化：渲染后重新测量，校准玩家列表底部留白
        wx.nextTick(() => { this.measureBottomBar(); });

        // socket 生命周期：游戏结束停止重连但保留健康 socket（可收后续事件）；
        // 活跃阶段首次获取状态后惰性建链
        if (phase === 'gameEnd') {
          api.stopReconnect();
          this.setData({ socketReconnecting: false });
          // 刺杀结算动画（全员）：从活跃阶段首次进入 gameEnd 且有刺杀记录时播放
          const prevPhase = this.data.currentPhase;
          if (gameAssassination && prevPhase && prevPhase !== 'gameEnd') {
            this.playAssassinationAnim(gameAssassination.correct);
          }
        } else if (!api._socketTask && this.data.roomId) {
          api.connectSocket(this.data.roomId, app.globalData.openId);
        }

        // gameEnd 结果由底部框展示（wxml currentPhase === 'gameEnd' 渲染）

        // 离开 roleReveal（进入 preNominate 或后续阶段）：关闭身份确认页/蒙版/等待态
        if (phase !== 'roleReveal') {
          this.setData({ showRolePage: false, showRoleMask: false, roleWaiting: false });
        }
        // 计时器仅在 discussion 阶段运行
        if (phase === 'discussion') {
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

  measureBottomBar() {
    const windowWidth = (wx.getWindowInfo && wx.getWindowInfo().windowWidth) || wx.getSystemInfoSync().windowWidth || 375;
    const rpxToPx = windowWidth / 750;
    wx.createSelectorQuery().select('.bottom-bar').boundingClientRect(rect => {
      if (rect && rect.height) {
        // bottomBarHeight = 底部栏实际高度 + 固定 16rpx 间距（均转 px）
        this.setData({ bottomBarHeight: rect.height + 16 * rpxToPx });
      }
    }).exec();
  },

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

  // 非房主：离开房间（退出房间 + 回首页）
  leaveRoom() {
    const { roomId } = this.data;
    wx.showLoading({ title: '离开中...', mask: true });
    api.leaveRoom(roomId).then(() => {
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/index/index' });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '离开失败', icon: 'none' });
    });
  },

  goHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  nominatePlayer(e) {
    if (!this.checkIfTeamLeader()) return;
    if (this.data.currentPhase !== 'preNominate' && this.data.currentPhase !== 'discussion') return;
    const playerId = e.currentTarget.dataset.id;
    // discussion 已满员时，未选中的禁用玩家不可再选（已选的可取消）
    const target = this.data.tablePlayers.find(p => p.openId === playerId);
    if (target && target.disabled && !target.checked) return;
    // 本地临时选中：点选/取消
    const sel = this.data.localSelected.slice();
    const i = sel.indexOf(playerId);
    if (i === -1) sel.push(playerId); else sel.splice(i, 1);
    // 重算所有玩家的 checked/disabled（基于新 localSelected，保证达到上限后立即禁用）
    const requiredSize = this.data.requiredTeamSize || 0;
    const isDiscussion = this.data.currentPhase === 'discussion';
    const atLimit = sel.length >= requiredSize;
    const tablePlayers = this.data.tablePlayers.map(p => {
      const checked = sel.includes(p.openId);
      const disabled = isDiscussion && atLimit && !checked;
      return { ...p, checked, disabled };
    });
    this.setData({ localSelected: sel, tablePlayers });
  },

  // preNominate 阶段：车主提交预选车型（发送 localSelected → 后端切到 speakingOrder）
  submitPreNomination() {
    if (!this.checkIfTeamLeader()) return;
    if (this.data.currentPhase !== 'preNominate') return;
    const { gameId, localSelected } = this.data;
    wx.showLoading({ title: '提交中...', mask: true });
    api.submitPreNomination(gameId, localSelected).then(() => {
      wx.hideLoading();
      this.fetchGameState();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    });
  },

  // speakingOrder 阶段：点击方向按钮提交（后端切到 discussion）
  selectSpeakingDirection(e) {
    if (!this.checkIfTeamLeader()) return;
    if (this.data.currentPhase !== 'speakingOrder') return;
    const order = e.currentTarget.dataset.order;
    if (!['asc', 'desc'].includes(order)) return;
    const { gameId } = this.data;
    wx.showLoading({ title: '提交中...', mask: true });
    api.selectSpeakingOrder(gameId, order).then(() => {
      wx.hideLoading();
      this.setData({ speakingOrder: order });
      this.fetchGameState();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    });
  },

  getRequiredTeamSize() {
    const playerCount = this.data.allPlayers?.length || 5;
    return getTeamSizeByRound(playerCount, this.data.currentRound);
  },

  // discussion 阶段：车主确认发车（提交 localSelected → teamVote）；强制发车时 forcedSend 为 true 直接进 missionVote
  confirmNomination() {
    const { gameId, localSelected, forcedSend, currentPhase } = this.data;
    const canSend = currentPhase === 'discussion' || (currentPhase === 'preNominate' && forcedSend);
    if (!canSend) {
      wx.showToast({ title: '请先完成选车', icon: 'none' });
      return;
    }
    const requiredSize = this.getRequiredTeamSize();
    if (localSelected.length !== requiredSize) {
      wx.showToast({ title: `需要 ${requiredSize} 人（当前${localSelected.length}）`, icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中...', mask: true });
    api.submitNomination(gameId, localSelected, forcedSend ? true : undefined).then(res => {
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

  // 长桌玩家点击（按阶段分发）
  onTablePlayerTap(e) {
    const { currentPhase } = this.data;
    if (currentPhase === 'preNominate' || currentPhase === 'discussion') {
      this.nominatePlayer(e);
    } else if (currentPhase === 'lake') {
      // 湖仙验人：持有者点击卡片单选目标（不可选自己/老湖仙），底部按钮确认
      if (this.data.isLakeHolder) {
        const targetOpenId = e.currentTarget.dataset.id;
        if (targetOpenId && targetOpenId !== this.data.playerId && !this.data.oldLakeOpenIds.includes(targetOpenId)) {
          this.setData({ lakeTargetOpenId: targetOpenId });
        }
      }
    } else if (currentPhase === 'assassination') {
      // 仅刺客/莫甘娜（canAssassinateVar）可点击卡片刺杀；非刺客点击无反应
      if (this.data.canAssassinateVar) {
        this.assassinate(e);
      }
    }
  },

  // lake 阶段：底部"确认查验"按钮（需先选中目标）
  confirmLakeInspect() {
    const { gameId, lakeTargetOpenId } = this.data;
    if (!lakeTargetOpenId) {
      wx.showToast({ title: '请先选择查验目标', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '验人中...', mask: true });
    api.lakeInspect(gameId, lakeTargetOpenId).then(res => {
      wx.hideLoading();
      const lake = (res && res.history && res.history.lake) || [];
      const last = lake[lake.length - 1];
      this.setData({
        lakeTargetOpenId: '',
        showLakeResult: !!(last && last.result),
        lakeResult: (last && last.result) || ''
      });
      this.fetchGameState();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '验人失败', icon: 'none' });
    });
  },

  closeLakeResult() {
    this.setData({ showLakeResult: false });
  },

  // 刺杀结算全屏动画：阶段1 刀落下 → 阶段2 成功/失败，全员播放
  playAssassinationAnim(correct) {
    this.setData({ showAssassinationAnim: true, assassinationSuccess: !!correct, assassinationPhase: 'knife' });
    if (this._assnAnimTimer) clearTimeout(this._assnAnimTimer);
    if (this._assnAnimTimer2) clearTimeout(this._assnAnimTimer2);
    this._assnAnimTimer = setTimeout(() => {
      this.setData({ assassinationPhase: 'result' });
      this._assnAnimTimer2 = setTimeout(() => {
        this.setData({ showAssassinationAnim: false, assassinationPhase: '' });
      }, 1400);
    }, 1200);
  },

  // lancelot 阶段：确认抽卡结果（全员确认后进入下一轮）
  confirmLancelot() {
    const { gameId } = this.data;
    wx.showLoading({ title: '确认中...', mask: true });
    api.confirmLancelot(gameId).then(() => {
      wx.hideLoading();
      this.fetchGameState();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '确认失败', icon: 'none' });
    });
  },

  // 中间区阶段名文字
  centerPhaseText() {
    const map = {
      roleReveal: '身份',
      preNominate: '预选',
      speakingOrder: '发言序',
      discussion: '发言',
      teamVote: '投票',
      missionVote: '任务',
      lake: '湖仙',
      lancelot: '抽卡',
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

    wx.showLoading({ title: '提交中...', mask: true });
    api.castVote(gameId, vote).then(() => {
      wx.hideLoading();
      this.fetchGameState();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '投票失败', icon: 'none' });
    });
  },

  // 任务投票弹窗：点击成功/失败半屏 → 确认弹窗 → 提交
  confirmMissionVote(e) {
    const vote = e.currentTarget.dataset.vote;
    const { gameId, playerRole, playerSide } = this.data;

    if (vote === 'fail') {
      // 以当前阵营为准（兰斯洛特转换可能改变 side）；后端为最终裁决
      const isEvil = playerSide === 'evil' || ['mordred', 'morgana', 'assassin', 'minion', 'oberon', 'lancelotRed'].includes(playerRole);
      if (!isEvil) {
        wx.showToast({ title: '只有坏人才能破坏任务', icon: 'error' });
        return;
      }
    }

    wx.showModal({
      title: vote === 'success' ? '完成任务' : '破坏任务',
      content: vote === 'success' ? '确认任务成功？' : '确认任务失败？',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...', mask: true });
          api.castMissionVote(gameId, vote, playerRole).then(() => {
            wx.hideLoading();
            this.fetchGameState();
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '任务投票失败', icon: 'none' });
          });
        }
      }
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

  // 任意阶段：刺客/莫甘娜开始刺杀（进入刺杀阶段）
  startAssassination() {
    const { gameId } = this.data;
    wx.showModal({
      title: '开始刺杀',
      content: '确定开始刺杀梅林？（进入刺杀阶段后选择目标）',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '进入刺杀...', mask: true });
          api.startAssassination(gameId).then(() => {
            wx.hideLoading();
            this.fetchGameState();
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '开始刺杀失败', icon: 'none' });
          });
        }
      }
    });
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
            // 放弃后留在游戏页刷新，与其他玩家看到相同的「游戏已放弃」gameEnd 页，不跳转
            this.fetchGameState();
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
            // room 页用 redirectTo 进入 game 页，页面栈无 room，需显式跳转
            if (this.data.roomId) {
              wx.redirectTo({ url: `/pages/room/room?roomId=${this.data.roomId}` });
            } else {
              wx.navigateBack();
            }
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
      'preNominate': '车主预选车型',
      'speakingOrder': '车主确定发言顺序',
      'discussion': '讨论阶段',
      'teamVote': '队伍投票',
      'missionVote': '任务投票',
      'missionResult': '任务结果',
      'lake': '湖仙验人',
      'lancelot': '兰斯抽卡',
      'assassination': '刺杀阶段',
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
