// components/history-card/history-card.js
// 历史对局列表（公共组件）
// 用法：<history-card title="历史对局" games="{{historyList}}" />
// games item: { gameId, roleName, side, playerCount, durationText, dateText, isWin }
Component({
  options: { addGlobalClass: true },
  properties: {
    title: { type: String, value: '历史对局' },
    games: { type: Array, value: [] },
    showCount: { type: Boolean, value: true }
  },
  methods: {
    onGameTap(e) {
      const gameId = e.currentTarget.dataset.id;
      if (!gameId) return;
      wx.navigateTo({ url: `/pages/game/game?gameId=${gameId}&fromHistory=1` });
    }
  }
});
