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

const SAVE_DEBOUNCE = 700;

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
    // 保存状态
    saveText: '',
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
    approved.forEach(p => { p.seatLabel = p.seatNumber + '号'; });

    // 被移除/被拒感知：上一刻还在、现在不在且仍在记录中
    if (this._prevMe && this._prevMe.openId && !rec.me && rec.status === 'recording') {
      wx.showToast({ title: '你已被移出记录', icon: 'none' });
    }
    this._prevMe = rec.me ? { openId: rec.me.openId || app.globalData.openId } : null;

    const me = rec.me;
    const patch = {
      loading: false, loadErr: '',
      rec,
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
          firstLeaderOpenId: '', firstLakeHolderOpenId: '',
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
        patch.carForm = this._buildCarForm(draft, curRound, patch.curCarIndex, approved);
        patch.lakeForm = this._buildLakeForm(draft, rules, approved, curRound);
        patch.lanceForm = patch.lanceForm || { round: curRound, switched: false };
        patch.asnForm = draft.assassination
          ? { killer: draft.assassination.killerOpenId, target: draft.assassination.targetOpenId, need: false }
          : { killer: '', target: '', need: false };
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
    if (rec.isOwner && rec.status === 'recording') this._recalcDraftDerived();
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
      if (!c.mission || !c.mission.votes) continue;
      const fails = Object.values(c.mission.votes).filter(v => v === 'fail').length;
      const ok = fails < ((c.round === 4 && playerCount >= 7) ? 2 : 1);
      if (ok) success++; else fail++;
    }
    return { success, fail };
  },
  _seatLabelOf(openId) {
    const p = (this.data.approved || []).find(x => x.openId === openId);
    return p ? p.seatNumber + '号' : '?';
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
      const mv = (c.mission && c.mission.votes) || null;
      const fails = mv ? Object.values(mv).filter(v => v === 'fail').length : 0;
      return {
        idx,
        round: c.round, carIndex: c.carIndex,
        leaderLabel: this._seatLabelOf(c.leaderOpenId),
        teamLabels: (c.team || []).map(t => this._seatLabelOf(t)).join('、'),
        voteText: c.forced ? '强制车' : (ap + '✓ ' + rj + '✕'),
        outcome: c.forced ? 'send' : (c.mission ? 'send' : 'reject'),
        outcomeText: c.forced ? '强制发车' : (c.mission ? '发车' : '流车'),
        missionText: mv ? (fails > 0 ? '失败(' + fails + '坏)' : '成功') : '',
        expanded: false
      };
    });
    const lakeList = (d.lake || []).map((l, idx) => ({
      idx, round: l.round,
      text: this._seatLabelOf(l.inspectorOpenId) + ' 验 ' + this._seatLabelOf(l.targetOpenId),
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
      firstLeaderLabel: d.firstLeaderOpenId ? this._seatLabelOf(d.firstLeaderOpenId) : '选择',
      firstLakeLabel: d.firstLakeHolderOpenId ? this._seatLabelOf(d.firstLakeHolderOpenId) : '选择',
      carLeaderLabel: cf && cf.leader ? this._seatLabelOf(cf.leader) : '选择',
      lakeInspectorLabel: lf && lf.inspector ? this._seatLabelOf(lf.inspector) : '选择',
      lakeTargetLabel: lf && lf.target ? this._seatLabelOf(lf.target) : '选择',
      asnKillerLabel: af && af.killer ? this._seatLabelOf(af.killer) : '选择',
      asnTargetLabel: af && af.target ? this._seatLabelOf(af.target) : '选择'
    };
    this.setData(patch);
  },

  // ── 自动静默保存 ──
  _scheduleSave() {
    this._saveDirty = true;
    this.setData({ saveText: '保存中…' });
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._doSave(true), SAVE_DEBOUNCE);
  },
  _doSave(silent) {
    const d = this.data.roundsDraft;
    if (!d) return Promise.resolve();
    this._saveDirty = false;
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    return api.saveOfflineRounds(this.data.recordId, d).then(res => {
      if (!res.success) throw new Error(res.message || '保存失败');
      const t = new Date();
      const p = n => (n < 10 ? '0' + n : '' + n);
      this.setData({ saveText: '已自动保存 ' + p(t.getHours()) + ':' + p(t.getMinutes()) });
      if (!silent) wx.showToast({ title: '已保存', icon: 'success' });
    }).catch(err => {
      this._saveDirty = true;
      this.setData({ saveText: '保存失败' });
      if (!silent) wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },
  _flushSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    if (this._saveDirty && this.data.roundsDraft && this.data.isOwner && this.data.recording) {
      api.saveOfflineRounds(this.data.recordId, this.data.roundsDraft).catch(() => {});
      this._saveDirty = false;
    }
  },
  retrySave() { this._doSave(false); },

  // ── 座位 ──
  _buildCarForm(draft, round, carIndex, approved) {
    const cars = (draft.cars || []).slice().sort((a, b) => (a.round - b.round) || (a.carIndex - b.carIndex));
    let leader = draft.firstLeaderOpenId;
    if (cars.length) {
      const last = cars[cars.length - 1].leaderOpenId;
      const idx = approved.findIndex(p => p.openId === last);
      if (idx >= 0 && approved[idx + 1]) leader = approved[idx + 1].openId;
    }
    if (!leader && approved.length) leader = approved[0].openId;
    return {
      round, carIndex, leader,
      team: [], voteSel: [], votes: {},
      forced: false, missionSel: [], mission: {}
    };
  },
  _buildLakeForm(draft, rules, approved, curRound) {
    if (!rules.ladyOfTheLake || !approved.length) return null;
    const used = new Set();
    (draft.lake || []).forEach(l => { used.add(l.inspectorOpenId); used.add(l.targetOpenId); });
    const candidates = approved.filter(p => !used.has(p.openId));
    let inspector = draft.firstLakeHolderOpenId;
    if ((draft.lake || []).length) inspector = draft.lake[draft.lake.length - 1].targetOpenId;
    if (!inspector || used.has(inspector)) inspector = candidates.length ? candidates[0].openId : '';
    const targets = candidates.filter(p => p.openId !== inspector);
    return {
      round: curRound || 1,
      inspector,
      target: targets.length ? targets[0].openId : '',
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
        wx.showToast({ title: invited ? '已入座' + seat + '号位' : '已申请，等待房主同意', icon: 'none' });
        this._apply(res.record, { resetDraft: false });
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
        api.removeOfflinePlayer(this.data.recordId, p.openId).then(r => this._apply(r.record, { resetDraft: false }))
          .catch(err => wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' }));
      }
    });
  },
  onRespond(e) {
    const { id, ok } = e.currentTarget.dataset;
    api.respondOfflineSeat(this.data.recordId, id, ok === '1').then(res => {
      if (res.success) this._apply(res.record, { resetDraft: false });
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
      if (res.success) { this.setData({ showAssign: false }); this._apply(res.record, { resetDraft: false }); }
      else wx.showToast({ title: res.message || '指定失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '指定失败', icon: 'none' }));
  },

  // ── 身份 ──
  onMyRoleChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const r = this.data.remainingRoles[idx];
    if (!r) return;
    api.setOfflineRole(this.data.recordId, r.role).then(res => {
      if (res.success) this._apply(res.record, { resetDraft: false });
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  onOwnerRoleChange(e) {
    const openId = e.currentTarget.dataset.id;
    const idx = parseInt(e.detail.value, 10);
    const role = this.data.remainingRoles[idx] ? this.data.remainingRoles[idx].role : null;
    api.setOfflineRole(this.data.recordId, role, openId).then(res => {
      if (res.success) this._apply(res.record, { resetDraft: false });
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  clearOwnerRole(e) {
    const openId = e.currentTarget.dataset.id;
    api.setOfflineRole(this.data.recordId, null, openId).then(res => {
      if (res.success) this._apply(res.record, { resetDraft: false });
      else wx.showToast({ title: res.message || '清除失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '清除失败', icon: 'none' }));
  },

  // ── 轮次记录（房主）──
  onFirstLeaderChange(e) {
    const d = this.data.roundsDraft;
    d.firstLeaderOpenId = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._scheduleSave();
  },
  onFirstLakeChange(e) {
    const d = this.data.roundsDraft;
    d.firstLakeHolderOpenId = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._scheduleSave();
  },
  onCarLeaderChange(e) {
    const f = this.data.carForm;
    f.leader = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ carForm: f });
    this._recalcDraftDerived();
  },
  onToggleTeam(e) {
    const id = e.currentTarget.dataset.id;
    const f = this.data.carForm;
    const p = this.data.approved.find(x => x.openId === id);
    const i = f.team.findIndex(t => t.openId === id);
    if (i >= 0) f.team.splice(i, 1);
    else if (p && f.team.length < this.data.teamSize) f.team.push(p);
    this.setData({ carForm: f });
  },
  onToggleVoteSel(e) {
    const id = e.currentTarget.dataset.id;
    const f = this.data.carForm;
    const i = f.voteSel.indexOf(id);
    if (i >= 0) f.voteSel.splice(i, 1); else f.voteSel.push(id);
    this.setData({ carForm: f });
  },
  // 所选 → 同意/反对（其余反面）；all-* 为全员快捷
  applyVotes(e) {
    const val = e.currentTarget.dataset.val;
    const f = this.data.carForm;
    if (val === 'all-approve') {
      this.data.approved.forEach(p => { f.votes[p.openId] = 'approve'; });
    } else if (val === 'all-reject') {
      this.data.approved.forEach(p => { f.votes[p.openId] = 'reject'; });
    } else {
      const agree = val === 'approve';
      this.data.approved.forEach(p => { f.votes[p.openId] = f.voteSel.includes(p.openId) === agree ? 'approve' : 'reject'; });
    }
    f.voteSel = [];
    this.setData({ carForm: f });
  },
  clearVotes() {
    const f = this.data.carForm;
    f.votes = {}; f.voteSel = [];
    this.setData({ carForm: f });
  },
  onToggleMissionSel(e) {
    const id = e.currentTarget.dataset.id;
    const f = this.data.carForm;
    const i = f.missionSel.indexOf(id);
    if (i >= 0) f.missionSel.splice(i, 1); else f.missionSel.push(id);
    this.setData({ carForm: f });
  },
  applyMission(e) {
    const fail = e.currentTarget.dataset.val === 'fail';
    const f = this.data.carForm;
    f.team.forEach(t => { f.mission[t.openId] = f.missionSel.includes(t.openId) === fail ? 'fail' : 'success'; });
    f.missionSel = [];
    this.setData({ carForm: f });
  },
  onForcedToggle() {
    const f = this.data.carForm;
    f.forced = !f.forced;
    this.setData({ carForm: f });
  },
  _carWillSend(f) {
    if (f.forced) return true;
    const vals = Object.values(f.votes);
    if (!vals.length || vals.length < this.data.approved.length) return false;
    const ap = vals.filter(v => v === 'approve').length;
    return ap > vals.length - ap;
  },
  submitCar() {
    const f = this.data.carForm;
    if (!f.leader) { wx.showToast({ title: '请选择队长', icon: 'none' }); return; }
    if (f.team.length !== this.data.teamSize) { wx.showToast({ title: '车队需 ' + this.data.teamSize + ' 人', icon: 'none' }); return; }
    const willSend = this._carWillSend(f);
    if (!f.forced && Object.keys(f.votes).length !== this.data.approved.length) {
      wx.showToast({ title: '票型未记录完整', icon: 'none' }); return;
    }
    if (willSend && Object.keys(f.mission).length !== f.team.length) {
      wx.showToast({ title: '任务票未记录完整', icon: 'none' }); return;
    }
    const d = this.data.roundsDraft;
    const entry = {
      round: f.round, carIndex: f.carIndex, leaderOpenId: f.leader,
      team: f.team.map(t => t.openId), forced: f.forced,
      votes: f.forced ? null : { ...f.votes },
      mission: willSend ? { votes: { ...f.mission } } : null
    };
    const editIdx = this.data.editingCarIdx;
    if (editIdx >= 0) d.cars.splice(editIdx, 0, entry);
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
      carForm: this._buildCarForm(d, curRound, nextIndex, this.data.approved)
    };
    this.setData(patch);
    this._recalcDraftDerived();
    this._scheduleSave();
  },
  editCar(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    const c = d.cars[idx];
    if (!c) return;
    const approved = this.data.approved;
    const teamObjs = (c.team || []).map(id => approved.find(p => p.openId === id)).filter(Boolean);
    const f = {
      round: c.round, carIndex: c.carIndex, leader: c.leaderOpenId,
      team: teamObjs, voteSel: [], votes: c.votes ? { ...c.votes } : {},
      forced: !!c.forced, missionSel: [],
      mission: (c.mission && c.mission.votes) ? { ...c.mission.votes } : {}
    };
    d.cars.splice(idx, 1);
    this.setData({ roundsDraft: d, carForm: f, editingCarIdx: idx });
    this._recalcDraftDerived();
    wx.showToast({ title: '已载入该车，修改后点「保存本车」', icon: 'none' });
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
      carForm: this._buildCarForm(d, curRound, nextIndex, this.data.approved)
    });
    this._recalcDraftDerived();
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
          patch.carForm = this._buildCarForm(d, curRound, patch.curCarIndex, this.data.approved);
        } else if (editingAfter) {
          patch.editingCarIdx = this.data.editingCarIdx - 1;
        }
        this.setData(patch);
        this._recalcDraftDerived();
        this._scheduleSave();
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
    else if (field === 'inspector') f.inspector = f.candidates[parseInt(e.detail.value, 10)].openId;
    else if (field === 'target') f.target = f.candidates.filter(c => c.openId !== f.inspector)[parseInt(e.detail.value, 10)].openId;
    else if (field === 'result') f.result = e.currentTarget.dataset.val;
    this.setData({ lakeForm: f });
    this._recalcDraftDerived();
  },
  addLake() {
    const f = this.data.lakeForm;
    if (!f.inspector || !f.target) { wx.showToast({ title: '请选择验人双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.lake.push({ round: f.round, inspectorOpenId: f.inspector, targetOpenId: f.target, result: f.result });
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.approved, this.data.curRound) });
    this._recalcDraftDerived();
    this._scheduleSave();
  },
  removeLake(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lake.splice(idx, 1);
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.approved, this.data.curRound) });
    this._recalcDraftDerived();
    this._scheduleSave();
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
    this._scheduleSave();
  },
  removeLance(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lancelot.splice(idx, 1);
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._scheduleSave();
  },
  onAsnField(e) {
    const { field } = e.currentTarget.dataset;
    const f = this.data.asnForm;
    if (field === 'killer') f.killer = this.data.approved[parseInt(e.detail.value, 10)].openId;
    else f.target = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ asnForm: f });
    this._recalcDraftDerived();
  },
  saveAsn() {
    const f = this.data.asnForm;
    if (!f.killer || !f.target) { wx.showToast({ title: '请选择刺杀双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.assassination = { killerOpenId: f.killer, targetOpenId: f.target };
    this.setData({ roundsDraft: d });
    this._recalcDraftDerived();
    this._scheduleSave();
    wx.showToast({ title: '已填入刺杀记录', icon: 'none' });
  },
  clearAsn() {
    wx.showModal({
      title: '清除刺杀记录', content: '确定清除吗？',
      success: m => {
        if (!m.confirm) return;
        const d = this.data.roundsDraft;
        d.assassination = null;
        this.setData({ roundsDraft: d, 'asnForm.killer': '', 'asnForm.target': '' });
        this._recalcDraftDerived();
        this._scheduleSave();
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
