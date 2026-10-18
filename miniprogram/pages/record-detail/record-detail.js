// pages/record-detail/record-detail.js
// 线下对局记录工作台：房主（座位管理/身份指定/轮次记录/完成/编辑/删除）+ 参与者（选座/自选身份）
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
    rec: null,             // 后端 detail
    boardLabel: '',
    isOwner: false,
    recording: false,
    // 视图派生
    seats: [],             // [{seat, player|null}]
    pending: [],           // 待审批玩家
    approved: [],          // 已入座玩家
    remainingRoles: [],    // 未分配身份 [{role, label, emoji}]
    configRoleCount: 0,
    // 参与者
    myRoleLabel: '',
    myRoleEmoji: '',
    // 房主：轮次草稿
    roundsDraft: null,
    carForm: null,
    lakeForm: null,
    lanceForm: null,
    asnForm: null,
    teamSize: 0,
    curRound: 1,
    curCarIndex: 1,
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
    this.setData({ themeClass: getThemeClass(), recordId });
    this.load(true);
  },

  onShow() {
    wx.setBackgroundColor({ backgroundColor: getThemeBg(this.data.themeClass) });
    this._startPoll();
  },

  onHide() { this._stopPoll(); },
  onUnload() { this._stopPoll(); },

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
      this._apply(res.record);
      // 受邀入座（分享带 seat）：首次且尚未在记录中
      if (this._inviteSeat && !res.record.me) {
        const seat = this._inviteSeat;
        this._inviteSeat = 0;
        return this._join(seat, true);
      }
    }).catch(err => {
      this.setData({ loading: false, loadErr: (err && err.message) || '加载失败' });
    });
  },

  _apply(rec) {
    const rules = (rec.roomConfig && rec.roomConfig.rules) || {};
    const configRoles = [...((rec.roomConfig && rec.roomConfig.roles && rec.roomConfig.roles.good) || []),
      ...((rec.roomConfig && rec.roomConfig.roles && rec.roomConfig.roles.evil) || [])];
    const players = rec.players || [];
    const approved = players.filter(p => p.seatStatus === 'approved').sort((a, b) => a.seatNumber - b.seatNumber);
    const pending = players.filter(p => p.seatStatus === 'pending');
    const seats = [];
    for (let i = 1; i <= rec.playerCount; i++) {
      seats.push({ seat: i, player: players.find(p => p.seatNumber === i && p.seatStatus === 'approved') || null });
    }
    const assigned = new Set(approved.map(p => p.role).filter(Boolean));
    const remainingRoles = configRoles.filter(r => !assigned.has(r)).map(r => ({
      role: r, label: ROLE_NAMES_SHORT[r] || r, emoji: ROLE_EMOJIS[r] || ''
    }));

    const me = rec.me;
    // 门控后的可见身份 → 展示名
    players.forEach(p => { p.roleLabel = p.role ? (ROLE_NAMES_SHORT[p.role] || p.role) : ''; });
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
      myRoleLabel: me && me.role ? (ROLE_NAMES_SHORT[me.role] || me.role) : '',
      myRoleEmoji: me && me.role ? (ROLE_EMOJIS[me.role] || '') : ''
    };

    // 房主：初始化轮次草稿与表单
    if (rec.isOwner) {
      const draft = rec.rounds ? JSON.parse(JSON.stringify(rec.rounds)) : {
        firstLeaderOpenId: '', firstLakeHolderOpenId: '',
        cars: [], lake: [], lancelot: [], assassination: null
      };
      patch.roundsDraft = draft;
      const curRound = this._nextRound(draft);
      patch.curRound = curRound;
      patch.curCarIndex = this._nextCarIndex(draft, curRound);
      patch.teamSize = (TEAM_SIZES[rec.playerCount] || TEAM_SIZES[5])[curRound - 1];
      if (!this.data.carForm || this._carFormDirty) {
        patch.carForm = this._buildCarForm(draft, curRound, patch.curCarIndex, approved);
      }
      patch.lakeForm = this._buildLakeForm(draft, rules, approved);
      patch.lanceForm = patch.lanceForm || { round: curRound, switched: false };
      const hasKiller = configRoles.some(r => r === 'assassin' || r === 'morgana');
      const successCount = this._missionCount(draft, true, rec.playerCount);
      patch.asnForm = draft.assassination
        ? { killer: draft.assassination.killerOpenId, target: draft.assassination.targetOpenId, need: hasKiller && successCount >= 3 }
        : { killer: '', target: '', need: hasKiller && successCount >= 3 };
    }
    this.setData(patch);
  },

  // 已有任务轮次 → 下一轮（有任务的轮次+1；最新车未发车则仍在该轮）
  _nextRound(draft) {
    let r = 1;
    for (const c of (draft.cars || [])) {
      if (c.mission) r = Math.min(5, c.round + 1);
      else r = c.round;
    }
    return r;
  },
  _nextCarIndex(draft, round) {
    return ((draft.cars || []).filter(c => c.round === round).length) + 1;
  },
  _missionCount(draft, success, playerCount) {
    let cnt = 0;
    for (const c of (draft.cars || [])) {
      if (!c.mission || !c.mission.votes) continue;
      const fails = Object.values(c.mission.votes).filter(v => v === 'fail').length;
      const ok = fails < ((c.round === 4 && playerCount >= 7) ? 2 : 1);
      if (ok === success) cnt++;
    }
    return cnt;
  },

  // ── 座位 ──
  _buildCarForm(draft, round, carIndex, approved) {
    // 默认队长：上一辆车长的下一位（按座位顺延）；首车默认 firstLeader 或 1 号位
    const cars = draft.cars || [];
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
  },  _buildLakeForm(draft, rules, approved) {
    if (!rules.ladyOfTheLake || !approved.length) return null;
    const used = new Set();
    (draft.lake || []).forEach(l => { used.add(l.inspectorOpenId); used.add(l.targetOpenId); });
    const candidates = approved.filter(p => !used.has(p.openId));
    let inspector = draft.firstLakeHolderOpenId;
    if ((draft.lake || []).length) inspector = draft.lake[draft.lake.length - 1].targetOpenId;
    if (!inspector || used.has(inspector)) inspector = candidates.length ? candidates[0].openId : '';
    const targets = candidates.filter(p => p.openId !== inspector);
    return {
      round: this.data.curRound || 1,
      inspector,
      target: targets.length ? targets[0].openId : '',
      result: 'good',
      candidates: candidates.map(p => ({ openId: p.openId, label: p.seatNumber + '号 ' + (p.nickName || '') }))
    };
  },

  onSeatTap(e) {
    const seat = parseInt(e.currentTarget.dataset.seat, 10);
    const entry = this.data.seats.find(s => s.seat === seat);
    if (entry && entry.player) return;           // 已有人：长按管理
    if (this.data.isOwner) return;               // 房主通过邀请/指定入座
    if (this.data.rec.me) {
      wx.showToast({ title: '你已在本记录中', icon: 'none' });
      return;
    }
    this._join(seat, false);
  },
  _join(seat, invited) {
    api.joinOfflineSeat(this.data.recordId, seat, invited).then(res => {
      if (res.success) {
        wx.showToast({ title: invited ? '已入座' : '已申请，等待房主同意', icon: 'none' });
        this._apply(res.record);
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
    wx.showActionSheet({
      itemList: ['移除玩家'],
      itemColor: '#DC2626',
      success: res => {
        if (res.tapIndex !== 0) return;
        wx.showModal({
          title: '移除玩家', content: `将 ${p.nickName} 移出 ${seat} 号位（身份一并清除）`,
          success: m => {
            if (!m.confirm) return;
            api.removeOfflinePlayer(this.data.recordId, p.openId).then(r => this._apply(r.record))
              .catch(err => wx.showToast({ title: (err && err.message) || '移除失败', icon: 'none' }));
          }
        });
      }
    });
  },
  onRespond(e) {
    const { id, ok } = e.currentTarget.dataset;
    api.respondOfflineSeat(this.data.recordId, id, ok === '1').then(res => {
      if (res.success) this._apply(res.record);
      else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  // ── 指定玩家（好友/搜索） ──
  openAssign(e) {
    const seat = parseInt(e.currentTarget.dataset.seat, 10);
    this.setData({ showAssign: true, assignSeat: seat, searchKey: '', searchResults: [] });
    if (!this.data.friends.length) {
      this.setData({ friendLoading: true });
      api.getFriends(app.globalData.openId).then(res => {
        this.setData({ friendLoading: false, friends: (res && res.friends) || [] });
      }).catch(() => this.setData({ friendLoading: false }));
    }
  },
  closeAssign() { this.setData({ showAssign: false }); },
  onSearchInput(e) { this.setData({ searchKey: e.detail.value }); },
  doSearch() {
    const key = (this.data.searchKey || '').trim();
    if (!key) return;
    api.searchUser(app.globalData.openId, key).then(res => {
      this.setData({ searchResults: (res && res.user) ? [res.user] : [] });
    }).catch(() => this.setData({ searchResults: [] }));
  },
  onAssignTap(e) {
    const id = e.currentTarget.dataset.id;
    api.assignOfflinePlayer(this.data.recordId, id, this.data.assignSeat).then(res => {
      if (res.success) { this.setData({ showAssign: false }); this._apply(res.record); }
      else wx.showToast({ title: res.message || '指定失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '指定失败', icon: 'none' }));
  },

  // ── 身份 ──
  // 参与者自选身份（picker range=remainingRoles）
  onMyRoleChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const r = this.data.remainingRoles[idx];
    if (!r) return;
    api.setOfflineRole(this.data.recordId, r.role).then(res => {
      if (res.success) this._apply(res.record);
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  // 房主指定玩家身份（picker：剩余身份 + 当前身份标记 + 清除）
  onOwnerRoleChange(e) {
    const openId = e.currentTarget.dataset.id;
    const idx = parseInt(e.detail.value, 10);
    const role = this.data.remainingRoles[idx] ? this.data.remainingRoles[idx].role : null;
    api.setOfflineRole(this.data.recordId, role, openId).then(res => {
      if (res.success) this._apply(res.record);
      else wx.showToast({ title: res.message || '设置失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' }));
  },
  clearOwnerRole(e) {
    const openId = e.currentTarget.dataset.id;
    api.setOfflineRole(this.data.recordId, null, openId).then(res => {
      if (res.success) this._apply(res.record);
      else wx.showToast({ title: res.message || '清除失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '清除失败', icon: 'none' }));
  },

  // ── 轮次记录（房主） ──
  onFirstLeaderChange(e) {
    const d = this.data.roundsDraft;
    d.firstLeaderOpenId = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ roundsDraft: d });
  },
  onFirstLakeChange(e) {
    const d = this.data.roundsDraft;
    d.firstLakeHolderOpenId = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ roundsDraft: d });
  },
  onCarLeaderChange(e) {
    const f = this.data.carForm;
    f.leader = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ carForm: f });
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
  // 所选 → 同意/反对，其余默认反面
  applyVotes(e) {
    const agree = e.currentTarget.dataset.val === 'approve';
    const f = this.data.carForm;
    this.data.approved.forEach(p => { f.votes[p.openId] = f.voteSel.includes(p.openId) === agree ? 'approve' : 'reject'; });
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
  addCar() {
    const f = this.data.carForm;
    if (!f.leader) { wx.showToast({ title: '请选择队长', icon: 'none' }); return; }
    if (f.team.length !== this.data.teamSize) { wx.showToast({ title: `车队需 ${this.data.teamSize} 人`, icon: 'none' }); return; }
    const willSend = this._carWillSend(f);
    if (!f.forced) {
      if (Object.keys(f.votes).length !== this.data.approved.length) {
        wx.showToast({ title: '票型未记录完整', icon: 'none' }); return;
      }
    }
    if (willSend && Object.keys(f.mission).length !== f.team.length) {
      wx.showToast({ title: '任务票未记录完整', icon: 'none' }); return;
    }
    const d = this.data.roundsDraft;
    d.cars.push({
      round: f.round, carIndex: f.carIndex, leaderOpenId: f.leader,
      team: f.team.map(t => t.openId), forced: f.forced,
      votes: f.forced ? null : { ...f.votes },
      mission: willSend ? { votes: { ...f.mission } } : null
    });
    this._carFormDirty = true;
    const nextIndex = this._nextCarIndex(d, f.round);
    const patch = { roundsDraft: d, carForm: this._buildCarForm(d, f.round, nextIndex, this.data.approved) };
    this.setData(patch);
    this._carFormDirty = false;
  },
  removeCar(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.cars.splice(idx, 1);
    this._carFormDirty = true;
    const curRound = this.data.carForm.round;
    const patch = { roundsDraft: d, carForm: this._buildCarForm(d, curRound, this._nextCarIndex(d, curRound), this.data.approved) };
    this.setData(patch);
    this._carFormDirty = false;
  },
  onLakeField(e) {
    const { field } = e.currentTarget.dataset;
    const f = this.data.lakeForm;
    if (field === 'round') f.round = parseInt(e.detail.value, 10) + 1;
    else if (field === 'inspector') f.inspector = f.candidates[parseInt(e.detail.value, 10)].openId;
    else if (field === 'target') f.target = f.candidates.filter(c => c.openId !== f.inspector)[parseInt(e.detail.value, 10)].openId;
    else if (field === 'result') f.result = e.currentTarget.dataset.val;
    this.setData({ lakeForm: f });
  },
  addLake() {
    const f = this.data.lakeForm;
    if (!f.inspector || !f.target) { wx.showToast({ title: '请选择验人双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.lake.push({ round: f.round, inspectorOpenId: f.inspector, targetOpenId: f.target, result: f.result });
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.approved) });
  },
  removeLake(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lake.splice(idx, 1);
    this.setData({ roundsDraft: d, lakeForm: this._buildLakeForm(d, (this.data.rec.roomConfig || {}).rules || {}, this.data.approved) });
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
  },
  removeLance(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const d = this.data.roundsDraft;
    d.lancelot.splice(idx, 1);
    this.setData({ roundsDraft: d });
  },
  onAsnField(e) {
    const { field } = e.currentTarget.dataset;
    const f = this.data.asnForm;
    if (field === 'killer') f.killer = this.data.approved[parseInt(e.detail.value, 10)].openId;
    else f.target = this.data.approved[parseInt(e.detail.value, 10)].openId;
    this.setData({ asnForm: f });
  },
  toggleAsn() {
    const d = this.data.roundsDraft;
    d.assassination = d.assassination ? null : { killerOpenId: this.data.asnForm.killer, targetOpenId: this.data.asnForm.target };
    this.setData({ roundsDraft: d });
  },
  saveAsn() {
    const f = this.data.asnForm;
    if (!f.killer || !f.target) { wx.showToast({ title: '请选择刺杀双方', icon: 'none' }); return; }
    const d = this.data.roundsDraft;
    d.assassination = { killerOpenId: f.killer, targetOpenId: f.target };
    this.setData({ roundsDraft: d });
    wx.showToast({ title: '已填入刺杀记录', icon: 'none' });
  },
  saveRounds() {
    const d = this.data.roundsDraft;
    if (!d.firstLeaderOpenId) { wx.showToast({ title: '请先选择首车主', icon: 'none' }); return; }
    api.saveOfflineRounds(this.data.recordId, d).then(res => {
      if (res.success) { wx.showToast({ title: '已保存', icon: 'success' }); this._apply(res.record); }
      else wx.showToast({ title: res.message || '保存失败', icon: 'none' });
    }).catch(err => wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' }));
  },
  finishRecord() {
    wx.showModal({
      title: '记录完成',
      content: '完成后将生成正式对局并计入统计（可随时编辑或删除）',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '生成对局中...', mask: true });
        api.finishOfflineRecord(this.data.recordId).then(r => {
          wx.hideLoading();
          if (r.success) {
            wx.showModal({
              title: '记录完成',
              content: '对局已生成，是否立即查看回放？',
              success: m => {
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
          if (r.success) this._apply(r.record);
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
      title: seat ? `来线下对局 ${seat} 号位` : '来记录这场线下对局',
      path: `/pages/record-detail/record-detail?recordId=${this.data.recordId}${seat ? '&seat=' + seat : ''}`
    };
  },
  setShareSeat(e) {
    this._shareSeat = parseInt(e.currentTarget.dataset.seat, 10) || 0;
  },
  noop() {}
});
