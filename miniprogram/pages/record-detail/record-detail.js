// pages/record-detail/record-detail.js
// 线下对局记录工作台：房主（座位/身份/轮次记录/完成）+ 参与者（选座/自选身份）
// 交互约定：
//  - 轮询只刷新协作区（座位/审批/身份/状态）；轮次草稿只在首次加载/保存回包/重开时重建，杜绝轮询回滚
//  - 草稿结构性变更后 700ms 防抖自动静默保存（失败可重试），无需手动保存
//  - 游戏内一律以「座位号」标识玩家（表单/票型/车辆列表不出现昵称，与玩家是谁解耦）
const api = require('../../services/api.js');
const app = getApp();
const { getThemeClass, getThemeBg } = require('../../utils/theme.js');
const { TEAM_SIZES, ROLE_NAMES_SHORT, ROLE_EMOJIS, BOARD_TYPE_LABELS } = require('../../utils/constants.js');


Page({
  data: {
    themeClass: '',
    recordId: '',
    loading: true,
    loadErr: '',
    rec: null,
    boardLabel: '',
    isOwner: false,
    recording: false,
    hasLancelot: false,
    lakeEnabled: false,
    configRoleCount: 0,
    // 协作区
    seats: [],
    pending: [],
    approved: [],
    remainingRoles: [],
    // 参与者
    mePending: false,
    meSeatLabel: '',
    myRoleLabel: '',
    myRoleEmoji: '',
    // 草稿区（房主）
    roundsDraft: null,
    carForm: null,
    lakeForm: null,
    lanceForm: null,
    asnForm: null,
    editingCarIdx: -1,
    curRound: 1,
    curCarIndex: 1,
    teamSize: 0,
    // 展示派生
    carList: [],
    lakeList: [],
    lanceList: [],
    checklist: { seats: { ok: false, text: '' }, roles: { ok: false, text: '' }, outcome: { ok: false, text: '' } },
    canFinish: false,
    progressText: '',
    outcomeText: '',
    showLake: false,
    showLance: false,
    // 表单派生（票型预判/任务票）
    allSeats: [],
    teamCount: 0,
    carWillSend: false,
    carAllVoted: false,
    votePreview: '',
    failThreshold: 1,
    failCountOptions: [],
    // 已完成摘要
    resultText: '',
    winnerIsGood: false,
    // 指定玩家弹层
    showSeatSheet: false,
    seatSheetSeat: 0,
    seatSheetPendingName: '',
    showAssign: false,
    assignSeat: 0,
    friends: [],
    friendLoading: false,
    searchKey: '',
    searchResults: []
  },

  onLoad(options) {
    const { recordId = '', seat = '' } = options || {};
    this._inviteSeat = seat ? parseInt(seat, 10) : 0;
    this._draftInited = false;
    this._prevMe = null;
    this.setData({ themeClass: getThemeClass(), recordId });
    this.load(true);
  },

  onShow() {
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
    this._startPoll();
  },
  onHide() { this._stopPoll(); this._flushSave(); },
  onUnload() { this._stopPoll(); this._flushSave(); },

  _startPoll() {
    this._stopPoll();
    this._poll = setInterval(() => {
      if (this.data.rec && this.data.recording) this.load(false);
    }, 2000);
  },
  _stopPoll() {
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  },

  load(loading) {
    this.setData({ loading: !!loading });
    return api.getOfflineRecord(this.data.recordId).then(res => {
      if (!res || !res.success) {
        this.setData({ loading: false, loadErr: (res && res.message) || '加载失败' });
        return;
      }
      // 状态翻转（别处完成/重开）→ 草稿全量重建
      const statusFlip = this.data.rec && this.data.rec.status !== res.record.status;
      this._apply(res.record, { resetDraft: !this._draftInited || statusFlip });
      if (this._inviteSeat && !res.record.me) {
        const seat = this._inviteSeat;
        this._inviteSeat = 0;
        return this._join(seat, true);
      }
    }).catch(err => {
      this.setData({ loading: false, loadErr: (err && err.message) || '加载失败' });
    });
  },

  _apply(rec, opts) {
    const resetDraft = !!(opts && opts.resetDraft);
    const rules = (rec.roomConfig && rec.roomConfig.rules) || {};
    const configRoles = [...((rec.roomConfig && rec.roomConfig.roles && rec.roomConfig.roles.good) || []),
      ...((rec.roomConfig && rec.roomConfig.roles && rec.roomConfig.roles.evil) || [])];
    const players = rec.players || [];
    const approved = players.filter(p => p.seatStatus === 'approved').sort((a, b) => a.seatNumber - b.seatNumber);
    const pending = players.filter(p => p.seatStatus === 'pending');
    const seats = [];
    const pendingBySeat = {};
    pending.forEach(p => { pendingBySeat[p.seatNumber] = p; });
    for (let i = 1; i <= rec.playerCount; i++) {
      seats.push({
        seat: i,
        player: players.find(p => p.seatNumber === i && p.seatStatus === 'approved') || null,
        pendingName: pendingBySeat[i] ? pendingBySeat[i].nickName : ''
      });
    }
    const assigned = new Set(approved.map(p => p.role).filter(Boolean));
    const remainingRoles = configRoles.filter(r => !assigned.has(r)).map(r => ({
      role: r, label: ROLE_NAMES_SHORT[r] || r, emoji: ROLE_EMOJIS[r] || ''
    }));
    players.forEach(p => { p.roleLabel = p.role ? (ROLE_NAMES_SHORT[p.role] || p.role) : ''; });
    approved.forEach(p => { p.seatLabel = String(p.seatNumber); });
    const allSeats = [];
    for (let i = 1; i <= rec.playerCount; i++) allSeats.push({ seat: i, seatLabel: String(i) });

    // 被移除/被拒感知：上一刻还在、现在不在且仍在记录中
    if (this._prevMe && this._prevMe.openId && !rec.me && rec.status === 'recording') {
      wx.showToast({ title: '你已被移出记录', icon: 'none' });
    }
    this._prevMe = rec.me ? { openId: rec.me.openId || app.globalData.openId } : null;

    const me = rec.me;
    const patch = {
      loading: false, loadErr: '',
      rec, allSeats,
      boardLabel: BOARD_TYPE_LABELS[rec.boardType] || rec.boardType,
      isOwner: !!rec.isOwner,
      recording: rec.status === 'recording',
      seats, pending, approved, remainingRoles,
      configRoleCount: configRoles.length,
      hasLancelot: configRoles.some(r => r === 'lancelotBlue' || r === 'lancelotRed'),
      lakeEnabled: !!rules.ladyOfTheLake,
      mePending: !!(me && me.seatStatus === 'pending'),
      meSeatLabel: me ? me.seatNumber + '号' : '',
      myRoleLabel: me && me.role ? (ROLE_NAMES_SHORT[me.role] || me.role) : '',
      myRoleEmoji: me && me.role ? (ROLE_EMOJIS[me.role] || '') : '',
      resultText: rec.result ? ((rec.result.winner === 'good' ? '🔵 蓝方获胜' : rec.result.winner === 'evil' ? '🔴 红方获胜' : '已结束') + (rec.result.reason ? ' · ' + rec.result.reason : '')) : '',
      winnerIsGood: !!(rec.result && rec.result.winner === 'good')
    };

    if (rec.isOwner && rec.status === 'recording') {
      this._killerInBoard = configRoles.some(r => r === 'assassin' || r === 'morgana');
      if (resetDraft || !this.data.roundsDraft) {
        const draft = rec.rounds ? JSON.parse(JSON.stringify(rec.rounds)) : {
          cars: [], lake: [], lancelot: [], assassination: null
        };
        draft.cars = (draft.cars || []).slice().sort((a, b) => (a.round - b.round) || (a.carIndex - b.carIndex));
        this._draftInited = true;
        patch.roundsDraft = draft;
        patch.editingCarIdx = -1;
        const curRound = this._nextRound(draft);
        patch.curRound = curRound;
        patch.curCarIndex = this._nextCarIndex(draft, curRound);
        patch.teamSize = (TEAM_SIZES[rec.playerCount] || TEAM_SIZES[5])[curRound - 1];
        patch.carForm = this._buildCarForm(draft, curRound, patch.curCarIndex);
        patch.lakeForm = this._buildLakeForm(draft, rules, curRound);
        patch.lanceForm = patch.lanceForm || { round: curRound, switched: false };
        patch.asnForm = draft.assassination
          ? { killerSeat: draft.assassination.killerSeat || 0, targetSeat: draft.assassination.targetSeat || 0, need: false }
          : { killerSeat: 0, targetSeat: 0, need: false };
      } else {
        // 轮询：保留本地草稿，仅同步派生展示
        patch.lanceForm = this.data.lanceForm;
        patch.carForm = this.data.carForm;
        patch.lakeForm = this.data.lakeForm;
        patch.asnForm = this.data.asnForm;
        patch.editingCarIdx = this.data.editingCarIdx;
        patch.roundsDraft = this.data.roundsDraft;
        patch.curRound = this.data.curRound;
        patch.curCarIndex = this.data.curCarIndex;
        patch.teamSize = this.data.teamSize;
      }
    }
    this.setData(patch);
    if (rec.isOwner && rec.status === 'recording') {
      this._recalcDraftDerived();
      this._refreshCarFormDerived();
    }
    this._markFriends();
  },

  _nextRound(draft) {
    const cars = (draft.cars || []).slice().sort((a, b) => (a.round - b.round) || (a.carIndex - b.carIndex));
    let r = 1;
    for (const c of cars) {
      if (c.mission) r = Math.min(5, c.round + 1);
      else r = c.round;
    }
    return r;
  },
  _nextCarIndex(draft, round) {
    return ((draft.cars || []).filter(c => c.round === round).length) + 1;
  },
  _missionStats(draft, playerCount) {
    let success = 0, fail = 0;
    for (const c of (draft.cars || [])) {
      if (!c.mission) continue;
      let ok = null;
      if (typeof c.mission.success === 'boolean') {
        ok = c.mission.success;
      } else if (c.mission.votes) {
        const fails = Object.values(c.mission.votes).filter(v => v === 'fail').length;
        ok = fails < ((c.round === 4 && playerCount >= 7) ? 2 : 1);
      }
      if (ok === null) continue;
      if (ok) success++; else fail++;
    }
    return { success, fail };
  },
  _missionFailCountOf(c) {
    if (!c.mission) return 0;
    if (typeof c.mission.success === 'boolean') return Number(c.mission.failCount) || 0;
    if (c.mission.votes) return Object.values(c.mission.votes).filter(v => v === 'fail').length;
    return 0;
  },
  _failThreshold(round) {
    return (round === 4 && this.data.rec && this.data.rec.playerCount >= 7) ? 2 : 1;
  },

  // 草稿派生展示：车辆/湖仙/兰斯列表、进度、checklist、条件卡、picker 标签
  _recalcDraftDerived() {
    const d = this.data.roundsDraft;
    const rec = this.data.rec;
    if (!d || !rec) return;
    const rules = (rec.roomConfig && rec.roomConfig.rules) || {};
    const N = rec.playerCount;

    const carList = (d.cars || []).map((c, idx) => {
      const votes = c.votes || {};
      const keys = Object.keys(votes);
      const ap = keys.filter(k => votes[k] === 'approve').length;
      const rj = keys.length - ap;
      const hasMission = !!c.mission;
      const fails = hasMission ? this._missionFailCountOf(c) : 0;
      const missionOk = hasMission ? c.mission.success === true : null;
      return {
        idx,
        round: c.round, carIndex: c.carIndex,
        editing: idx === this.data.editingCarIdx,
        leaderLabel: c.leaderSeat,
        teamLabels: (c.team || []).join('、'),
        voteText: c.forced ? '强制车' : (ap + '✓ ' + rj + '✕'),
        outcome: c.forced || hasMission ? 'send' : 'reject',
        outcomeText: c.forced ? '强制发车' : (hasMission ? '发车' : '流车'),
        missionText: hasMission ? (missionOk ? (fails > 0 ? '成功(' + fails + '坏)' : '成功') : '失败(' + fails + '坏)') : '',
        expanded: false
      };
    });
    const lakeList = (d.lake || []).map((l, idx) => ({
      idx, round: l.round,
      text: (l.inspectorSeat || '?') + ' 验 ' + (l.targetSeat || '?'),
      result: l.result
    }));
    const lanceList = (d.lancelot || []).map((s, idx) => ({
      idx, round: s.round, switched: !!s.switched
    }));

    const stats = this._missionStats(d, N);
    const hasKiller = this._killerInBoard;
    const needAsn = hasKiller && stats.success >= 3;
    const outcomeDone = stats.fail >= 3 || (stats.success >= 3 && (!needAsn || !!d.assassination));
    let outcomeText = '';
    if (stats.fail >= 3) outcomeText = '🔴 红方获胜（3坏）';
    else if (stats.success >= 3 && !needAsn) outcomeText = '🔵 蓝方获胜（3成）';
    else if (stats.success >= 3 && needAsn && d.assassination) outcomeText = '待生成时判定刺杀';
    else outcomeText = '未定';

    const seatsOk = this.data.approved.length === N;
    const rolesOk = seatsOk && this.data.remainingRoles.length === 0;
    const checklist = {
      seats: { ok: seatsOk, text: this.data.approved.length + '/' + N },
      roles: { ok: rolesOk, text: rolesOk ? N + '/' + N : (N - this.data.remainingRoles.length) + '/' + N },
      outcome: { ok: outcomeDone, text: outcomeText }
    };

    const curRound = this.data.curRound;
    const completedMissions = stats.success + stats.fail;
    const cf = this.data.carForm;
    const lf = this.data.lakeForm;
    const af = this.data.asnForm;
    const patch = {
      carList, lakeList, lanceList,
      checklist,
      canFinish: seatsOk && rolesOk && outcomeDone,
      outcomeText,
      progressText: '第' + curRound + '轮 · 🔵' + stats.success + ' 🔴' + stats.fail + (outcomeDone ? ' · ' + outcomeText : ''),
      showLake: this.data.lakeEnabled && (completedMissions >= Math.max(0, (rules.ladyOfTheLakeRound || 2) - 1) || lakeList.length > 0),
      showLance: this.data.hasLancelot && (completedMissions >= Math.max(1, (rules.lancelotSwapRound || 2) - 1) || lanceList.length > 0),
      'asnForm.need': needAsn,
      carLeaderLabel: cf && cf.leaderSeat ? String(cf.leaderSeat) : '选择',
      lakeInspectorLabel: lf && lf.inspectorSeat ? String(lf.inspectorSeat) : '选择',
      lakeTargetLabel: lf && lf.targetSeat ? String(lf.targetSeat) : '选择',
      asnKillerLabel: af && af.killerSeat ? String(af.killerSeat) : '选择',
      asnTargetLabel: af && af.targetSeat ? String(af.targetSeat) : '选择'
    };
    this.setData(patch);
  },

  // ── 即时保存：座位/身份/车的增删/湖仙/兰斯/刺杀操作成功后触发（无周期保存） ──
  _saveNow() {
    if (!this.data.isOwner || !this.data.recording || !this.data.roundsDraft) return;
    api.saveOfflineRounds(this.data.recordId, this.data.roundsDraft).then(res => {
      if (!res.success) throw new Error(res.message || '保存失败');
    }).catch(err => {
      this._saveDirty = true;
      wx.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' });
    });
  },
  _flushSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    if (this._saveDirty && this.data.roundsDraft && this.data.isOwner && this.data.recording) {
      api.saveOfflineRounds(this.data.recordId, this.data.roundsDraft).catch(() => {});
      this._saveDirty = false;
    }
  },

  // ── 座位 ──
  _buildCarForm(draft, round, carIndex) {
    const N = (this.data.rec && this.data.rec.playerCount) || 5;
    const cars = (draft.cars || []).slice().sort((a, b) => (a.round - b.round) || (a.carIndex - b.carIndex));
    // 默认队长：上一辆车长座位顺延（1..N 循环）；首车默认 1 号位
    let leader = 1;
    if (cars.length && Number.isInteger(cars[cars.length - 1].leaderSeat)) {
      leader = (cars[cars.length - 1].leaderSeat % N) + 1;
    }
    return {
      round, carIndex, leaderSeat: leader,
      teamSel: {}, votes: {},
      forced: false, mission: { outcome: '', failCount: 0 }
    };
  },
  _buildLakeForm(draft, rules, curRound) {
    if (!rules.ladyOfTheLake) return null;
    const N = (this.data.rec && this.data.rec.playerCount) || 5;
    const used = new Set();
    (draft.lake || []).forEach(l => { used.add(l.inspectorSeat); used.add(l.targetSeat); });
    const candidates = [];
    for (let i = 1; i <= N; i++) if (!used.has(i)) candidates.push({ seat: i, seatLabel: String(i) });
    // 默认验人者：上次验人的目标座位，否则候选首位
    let inspector = 0;
    if ((draft.lake || []).length) inspector = draft.lake[draft.lake.length - 1].targetSeat;
    if (!inspector || used.has(inspector)) inspector = candidates.length ? candidates[0].seat : 0;
    const targets = candidates.filter(c => c.seat !== inspector);
    return {
      round: curRound || 1,
      inspectorSeat: inspector,
      targetSeat: targets.length ? targets[0].seat : 0,
      result: 'good',
      candidates
    };
  },

  onSeatTap(e) {
    const seat = parseInt(e.currentTarget.dataset.seat, 10);
    const entry = this.data.seats.find(s => s.seat === seat);
    if (entry && entry.player) return;
    if (this.data.isOwner) {
      // 房主点空位：底部弹层（邀请/指定/自己上座）
      if (this.data.recording) {
        this.setData({ showSeatSheet: true, seatSheetSeat: seat, seatSheetPendingName: entry ? entry.pendingName : '' });
      }
      return;
    }
    if (this.data.rec.me) {
      wx.showToast({ title: '你已在本记录中', icon: 'none' });
      return;
    }
    this._join(seat, false);
  },
  closeSeatSheet() { this.setData({ showSeatSheet: false }); },
  seatSheetAssign() {
    const seat = this.data.seatSheetSeat;
    this.setData({ showSeatSheet: false });
    this._openAssignAt(seat);
  },
  seatSheetSit() {
    const seat = this.data.seatSheetSeat;
    this.setData({ showSeatSheet: false });
    this._join(seat, true);
  },
  _join(seat, invited) {
    api.joinOfflineSeat(this.data.recordId, seat, invited).then(res => {
      if (res.success) {
        wx.showToast({ title: invited ? '已入座 ' + seat + ' 号位' : '已申请，等待房主同意', icon: 'none' });
        this._apply(res.record, { resetDraft: false });
        this._saveNow();
      } else {
        wx.showToast({ title: res.message || '入座失败', icon: 'none' });
      }
    }).catch(err => wx.showToast({ title: (err && err.message) || '入座失败', icon: 'none' }));
  },
  onSeatLongPress(e) {
    if (!this.data.isOwner) return;
    const seat = parseInt(e.currentTarget.dataset.seat, 10);
    const entry = this.data.seats.find(s => s.seat === seat);
    if (!entry || !entry.player) return;
    const p = entry.player;
    wx.showModal({
      title: '移除玩家',
      content: '将 ' + seat + '号位玩家移出（身份一并清除）',
      confirmColor: '#DC2626',
      success: m => {
        if (!m.confirm) return;
        api.removeOfflinePlayer(this.data.recordId, p.openId).then(r => {
          this._apply(r.record, { resetDraft: false });
          this._saveNow();
        }).catch(err => wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' }));
      }
    });
  },
  onRespond(e) {
    const { id, ok } = e.currentTarget.dataset;
    api.respondOfflineSeat(this.data.recordId, id, ok === '1').then(res => {
      if (res.success) { this._apply(res.record, { resetDraft: false }); this._saveNow(); }
      else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  // ── 指定玩家（好友/搜索） ──
  _markFriends() {
    if (!this.data.friends.length || !this.data.rec) return;
    const inRecord = new Set((this.data.rec.players || []).map(p => p.openId));
    const friends = this.data.friends.map(f => ({ ...f, inRecord: inRecord.has(f.openId) }));
    this.setData({ friends });
  },
  openAssign(e) {
    this._openAssignAt(parseInt(e.currentTarget.dataset.seat, 10));
  },
  _openAssignAt(seat) {
    this.setData({ showAssign: true, assignSeat: seat, searchKey: '', searchResults: [] });
    if (!this.data.friends.length) {
      this.setData({ friendLoading: true });
      api.getFriends(app.globalData.openId).then(res => {
        this.setData({ friendLoading: false, friends: (res && res.friends) || [] });
        this._markFriends();
      }).catch(() => this.setData({ friendLoading: false }));
    } else {
      this._markFriends();
    }
  },
  closeAssign() { this.setData({ showAssign: false }); },
  onSearchInput(e) { this.setData({ searchKey: e.detail.value }); },
  doSearch() {
    const key = (this.data.searchKey || '').trim();
    if (!key) return;
    api.searchUser(app.globalData.openId, key).then(res => {
      const inRecord = new Set(((this.data.rec && this.data.rec.players) || []).map(p => p.openId));
      const u = res && res.user;
      this.setData({ searchResults: (u && !inRecord.has(u.openId)) ? [u] : [] });
    }).catch(() => this.setData({ searchResults: [] }));
  },
  onAssignTap(e) {
    const id = e.currentTarget.dataset.id;
    api.assignOfflinePlayer(this.data.recordId, id, this.data.assignSeat).then(res => {
      if (res.success) { this.setData({ showAssign: false }); this._apply(res.record, { resetDraft: false }); this._saveNow(); }
      else wx.showToast({ title: res.message || '指定失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '指定失败', icon: 'none' }));
  },

  // ── 身份 ──
  onMyRoleChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const r = this.data.remainingRoles[idx];
    if (!r) return;
    api.setOfflineRole(this.data.recordId, r.role).then(res => {
      if (res.success) { this._apply(res.record, { resetDraft: false }); this._saveNow(); }
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  onOwnerRoleChange(e) {
    const openId = e.currentTarget.dataset.id;
    const idx = parseInt(e.detail.value, 10);
    const role = this.data.remainingRoles[idx] ? this.data.remainingRoles[idx].role : null;
    api.setOfflineRole(this.data.recordId, role, openId).then(res => {
      if (res.success) { this._apply(res.record, { resetDraft: false }); this._saveNow(); }
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  clearOwnerRole(e) {
    const openId = e.currentTarget.dataset.id;
    api.setOfflineRole(this.data.recordId, null, openId).then(res => {
      if (res.success) { this._apply(res.record, { resetDraft: false }); this._saveNow(); }
      else wx.showToast({ title: res.message || '清除失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '清除失败', icon: 'none' }));
  },

  // ── 轮次记录（房主）──
  onCarLeaderChange(e) {
    const f = this.data.carForm;
    f.leaderSeat = this.data.allSeats[parseInt(e.detail.value, 10)].seat;
    this.setData({ carForm: f });
    this._recalcDraftDerived();
  },
  // 车队：teamSel 为 {座位号: true} map（wxml 成员访问绑定，空位同样可选）
  onToggleTeam(e) {
    const seat = parseInt(e.currentTarget.dataset.seat, 10);
    const f = this.data.carForm;
    if (f.teamSel[seat]) delete f.teamSel[seat];
    else if (Object.keys(f.teamSel).length < this.data.teamSize) f.teamSel[seat] = true;
    this.setData({ carForm: f });
    this._refreshCarFormDerived();
  },
  // 号码牌点击循环：灰 → 绿(同意) → 红(反对) → 绿…
  onVoteChipTap(e) {
    const seat = e.currentTarget.dataset.seat;
    const f = this.data.carForm;
    const cur = f.votes[seat];
    f.votes[seat] = (cur === 'approve') ? 'reject' : 'approve';
    this.setData({ carForm: f });
    this._refreshCarFormDerived();
  },
  // 全员同意 / 全员反对 / 全部清空（覆盖全部座位）
  applyVotes(e) {
    const val = e.currentTarget.dataset.val;
    const f = this.data.carForm;
    if (val === 'all-approve' || val === 'all-reject') {
      const v = val === 'all-approve' ? 'approve' : 'reject';
      this.data.allSeats.forEach(p => { f.votes[p.seat] = v; });
    } else if (val === 'clear') {
      f.votes = {};
    }
    this.setData({ carForm: f });
    this._refreshCarFormDerived();
  },
  // 任务票：结果二选一 + 失败票数
  setMissionOutcome(e) {
    const val = e.currentTarget.dataset.val;
    const f = this.data.carForm;
    f.mission.outcome = (f.mission.outcome === val) ? '' : val;
    f.mission.failCount = 0;
    this.setData({ carForm: f });
    this._refreshCarFormDerived();
  },
  setFailCount(e) {
    const n = parseInt(e.currentTarget.dataset.n, 10);
    const f = this.data.carForm;
    f.mission.failCount = n;
    this.setData({ carForm: f });
  },
  onForcedToggle() {
    const f = this.data.carForm;
    f.forced = !f.forced;
    this.setData({ carForm: f });
    this._refreshCarFormDerived();
  },
  // 表单派生：派车预判 + 保护轮阈值 + 失败票数可选范围
  _refreshCarFormDerived() {
    const f = this.data.carForm;
    if (!f) return;
    const N = this.data.allSeats.length;
    const teamCount = Object.keys(f.teamSel).length;
    const vals = Object.values(f.votes);
    const ap = vals.filter(v => v === 'approve').length;
    const rj = vals.filter(v => v === 'reject').length;
    const allVoted = !f.forced && vals.length === N;
    const willSend = f.forced || (allVoted && ap > rj);
    const threshold = this._failThreshold(f.round);
    let failCountOptions = [];
    if (f.mission.outcome === 'fail') {
      for (let i = threshold; i <= teamCount; i++) failCountOptions.push(i);
    } else if (f.mission.outcome === 'success' && threshold > 1) {
      for (let i = 0; i < threshold; i++) failCountOptions.push(i);
    }
    this.setData({
      teamCount,
      carWillSend: willSend,
      carAllVoted: allVoted,
      votePreview: f.forced ? '强制发车' : (allVoted ? (willSend ? '✓ 发车' : '✗ 流车') : (vals.length + '/' + N + ' 已投')),
      failThreshold: threshold,
      failCountOptions
    });
  },
  _carWillSend(f) {
    if (f.forced) return true;
    const N = this.data.allSeats.length;
    const vals = Object.values(f.votes);
    if (vals.length !== N) return false;
    const ap = vals.filter(v => v === 'approve').length;
    return ap > vals.length - ap;
  },
  submitCar() {
    const f = this.data.carForm;
    const team = Object.keys(f.teamSel).map(Number).sort((a, b) => a - b);
    const N = this.data.allSeats.length;
    if (!f.leaderSeat) { wx.showToast({ title: '请选择队长', icon: 'none' }); return; }
    if (team.length !== this.data.teamSize) { wx.showToast({ title: '车队需 ' + this.data.teamSize + ' 人', icon: 'none' }); return; }
    const willSend = this._carWillSend(f);
    if (!f.forced && Object.keys(f.votes).length !== N) {
      wx.showToast({ title: '票型未记录完整', icon: 'none' }); return;
    }
    const threshold = this._failThreshold(f.round);
    if (willSend) {
      if (!f.mission.outcome) { wx.showToast({ title: '请记录任务成功或失败', icon: 'none' }); return; }
      const fc = f.mission.failCount;
      if (f.mission.outcome === 'fail' && fc < threshold) { wx.showToast({ title: '失败票数未达阈值', icon: 'none' }); return; }
      if (f.mission.outcome === 'success' && fc >= threshold) { wx.showToast({ title: '成功票数与结果矛盾', icon: 'none' }); return; }
    }
    const d = this.data.roundsDraft;
    const entry = {
      round: f.round, carIndex: f.carIndex, leaderSeat: f.leaderSeat,
      team, forced: f.forced,
      votes: f.forced ? null : { ...f.votes },
      mission: willSend ? { success: f.mission.outcome === 'success', failCount: f.mission.failCount } : null
    };
    const editIdx = this.data.editingCarIdx;
    if (editIdx >= 0) d.cars.splice(editIdx, 1, entry);
    else d.cars.push(entry);
    d.cars.sort((a, b) => (a.round - b.round) || (a.carIndex - b.carIndex));
    // 编辑可能改变轮次推进，重算当前轮/车次
    const curRound = this._nextRound(d);
    const nextIndex = this._nextCarIndex(d, curRound);
    const patch = {
      roundsDraft: d,
      editingCarIdx: -1,
      curRound,
      curCarIndex: nextIndex,
      teamSize: (TEAM_SIZES[this.data.rec.playerCount] || TEAM_SIZES[5])[curRound - 1],
      carForm: this._buildCarForm(d, curRound, nextIndex)
    };
    this.setData(patch);
    this._recalcDraftDerived();
    this._refreshCarFormDerived();
    this._saveNow();
  },
  editCar(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    const c = d.cars[idx];
    if (!c) return;
    const N = this.data.allSeats.length;
    const teamSel = {};
    (c.team || []).forEach(seat => { if (seat >= 1 && seat <= N) teamSel[seat] = true; });
    const votes = {};
    Object.keys(c.votes || {}).forEach(seat => { votes[seat] = c.votes[seat]; });
    let outcome = '';
    let failCount = 0;
    if (c.mission && typeof c.mission.success === 'boolean') {
      outcome = c.mission.success ? 'success' : 'fail';
      failCount = Number(c.mission.failCount) || 0;
    }
    const f = {
      round: c.round, carIndex: c.carIndex, leaderSeat: c.leaderSeat || 1,
      teamSel, votes,
      forced: !!c.forced,
      mission: { outcome, failCount }
    };
    // 不从草稿移除：提交时替换，取消时丢弃，避免中途保存丢失
    this.setData({ carForm: f, editingCarIdx: idx });
    this._recalcDraftDerived();
    this._refreshCarFormDerived();
    wx.showToast({ title: '已载入该车，修改后点「保存本车修改」', icon: 'none' });
  },
  cancelEditCar() {
    const d = this.data.roundsDraft;
    const curRound = this._nextRound(d);
    const nextIndex = this._nextCarIndex(d, curRound);
    this.setData({
      editingCarIdx: -1,
      curRound,
      curCarIndex: nextIndex,
      teamSize: (TEAM_SIZES[this.data.rec.playerCount] || TEAM_SIZES[5])[curRound - 1],
      carForm: this._buildCarForm(d, curRound, nextIndex)
    });
    this._recalcDraftDerived();
    this._refreshCarFormDerived();
  },
  removeCar(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    wx.showModal({
      title: '删除本车',
      content: '删除后需重新录入该车记录',
      confirmColor: '#DC2626',
      success: m => {
        if (!m.confirm) return;
        const d = this.data.roundsDraft;
        d.cars.splice(idx, 1);
        const wasEditing = this.data.editingCarIdx === idx;
        const editingAfter = this.data.editingCarIdx > idx;
        const curRound = this._nextRound(d);
        const patch = {
          roundsDraft: d,
          curRound,
          curCarIndex: this._nextCarIndex(d, curRound),
          teamSize: (TEAM_SIZES[this.data.rec.playerCount] || TEAM_SIZES[5])[curRound - 1]
        };
        if (wasEditing) {
          patch.editingCarIdx = -1;
          patch.carForm = this._buildCarForm(d, curRound, patch.curCarIndex);
        } else if (editingAfter) {
          patch.editingCarIdx = this.data.editingCarIdx - 1;
        }
        this.setData(patch);
        this._recalcDraftDerived();
        this._saveNow();
      }
    });
  },
  toggleCarExpand(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const list = this.data.carList;
    if (list[idx]) list[idx].expanded = !list[idx].expanded;
    this.setData({ carList: list });
  },
  onLakeField(e) {
    const { field } = e.currentTarget.dataset;
    const f = this.data.lakeForm;
    if (field === 'round') f.round = parseInt(e.detail.value, 10) + 1;
    else if (field === 'inspector') f.inspectorSeat = f.candidates[parseInt(e.detail.value, 10)].seat;
    else if (field === 'target') f.targetSeat = f.candidates.filter(c => c.seat !== f.inspectorSeat)[parseInt(e.detail.value, 10)].seat;
    else if (field === 'result') f.result = e.currentTarget.dataset.val;
    this.setData({ lakeForm: f });
    this._recalcDraftDerived();
  },
  addLake() {
    const f = this.data.lakeForm;
    if (!f.inspectorSeat || !f.targetSeat) { wx.showToast({ title: '请选择验人双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.lake.push({ round: f.round, inspectorSeat: f.inspectorSeat, targetSeat: f.targetSeat, result: f.result });
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.curRound) });
    this._recalcDraftDerived();
    this._saveNow();
  },
  removeLake(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lake.splice(idx, 1);
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.curRound) });
    this._recalcDraftDerived();
    this._saveNow();
  },
  onLanceField(e) {
    const f = this.data.lanceForm;
    if (e.currentTarget.dataset.field === 'round') f.round = parseInt(e.detail.value, 10) + 1;
    else f.switched = e.detail.value === 'true';
    this.setData({ lanceForm: f });
  },
  addLance() {
    const d = this.data.roundsDraft;
    d.lancelot.push({ round: this.data.lanceForm.round, switched: this.data.lanceForm.switched });
    this.setData({ roundsDraft: d, lanceForm: { round: this.data.lanceForm.round, switched: false } });
    this._recalcDraftDerived();
    this._saveNow();
  },
  removeLance(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lancelot.splice(idx, 1);
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._saveNow();
  },
  onAsnField(e) {
    const { field } = e.currentTarget.dataset;
    const f = this.data.asnForm;
    if (field === 'killer') f.killerSeat = this.data.allSeats[parseInt(e.detail.value, 10)].seat;
    else f.targetSeat = this.data.allSeats[parseInt(e.detail.value, 10)].seat;
    this.setData({ asnForm: f });
    this._recalcDraftDerived();
  },
  saveAsn() {
    const f = this.data.asnForm;
    if (!f.killerSeat || !f.targetSeat) { wx.showToast({ title: '请选择刺杀双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.assassination = { killerSeat: f.killerSeat, targetSeat: f.targetSeat };
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._saveNow();
    wx.showToast({ title: '已填入刺杀记录', icon: 'none' });
  },
  clearAsn() {
    wx.showModal({
      title: '清除刺杀记录', content: '确定清除吗？',
      success: m => {
        if (!m.confirm) return;
        const d = this.data.roundsDraft;
        d.assassination = null;
        this.setData({ roundsDraft: d, 'asnForm.killerSeat': 0, 'asnForm.targetSeat': 0 });
        this._recalcDraftDerived();
        this._saveNow();
      }
    });
  },
  finishRecord() {
    if (!this.data.canFinish) {
      const c = this.data.checklist;
      const miss = !c.seats.ok ? '座位未满' : !c.roles.ok ? '身份未全部分配' : '胜负未定（或缺少刺杀记录）';
      wx.showToast({ title: miss, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '记录完成',
      content: '完成后将生成正式对局并计入统计（可随时编辑或删除）',
      success: res => {
        if (!res.confirm) return;
        this._flushSave();
        wx.showLoading({ title: '生成对局中...', mask: true });
        api.finishOfflineRecord(this.data.recordId).then(r => {
          wx.hideLoading();
          if (r.success) {
            wx.showModal({
              title: '记录完成',
              content: '对局已生成，是否立即查看回放？',
              success: m => {
                this._draftInited = false;
                this.load(true);
                if (m.confirm) wx.navigateTo({ url: `/pages/game/game?gameId=${r.gameId}&fromHistory=1` });
              }
            });
          } else {
            wx.showToast({ title: r.message || '完成失败', icon: 'none' });
          }
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '完成失败', icon: 'none' });
        });
      }
    });
  },
  reopenRecord() {
    wx.showModal({
      title: '编辑记录',
      content: '重开为草稿；统计中的旧结果将保留至再次「记录完成」',
      success: res => {
        if (!res.confirm) return;
        api.reopenOfflineRecord(this.data.recordId).then(r => {
          if (r.success) { this._draftInited = false; this.load(true); }
          else wx.showToast({ title: r.message || '重开失败', icon: 'none' });
        }).catch(err => wx.showToast({ title: (err && err.message) || '重开失败', icon: 'none' }));
      }
    });
  },
  deleteRecord() {
    wx.showModal({
      title: '删除记录',
      content: '将连同已生成的对局与统计数据一并删除',
      confirmColor: '#DC2626',
      success: res => {
        if (!res.confirm) return;
        api.deleteOfflineRecord(this.data.recordId).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        }).catch(err => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
      }
    });
  },
  viewReplay() {
    if (!this.data.rec.gameId) return;
    wx.navigateTo({ url: `/pages/game/game?gameId=${this.data.rec.gameId}&fromHistory=1` });
  },
  leaveRecord() {
    wx.showModal({
      title: '退出记录',
      content: '退出后需重新申请入座',
      success: res => {
        if (!res.confirm) return;
        api.leaveOfflineRecord(this.data.recordId).then(() => this.load(true))
          .catch(err => wx.showToast({ title: (err && err.message) || '退出失败', icon: 'none' }));
      }
    });
  },

  onShareAppMessage() {
    const seat = this._shareSeat || 0;
    this._shareSeat = 0;
    return {
      title: seat ? '来线下对局 ' + seat + ' 号位' : '来记录这场线下对局',
      path: '/pages/record-detail/record-detail?recordId=' + this.data.recordId + (seat ? '&seat=' + seat : '')
    };
  },
  setShareSeat(e) {
    this._shareSeat = parseInt(e.currentTarget.dataset.seat, 10) || 0;
  },
  noop() {}
});
