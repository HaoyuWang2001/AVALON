// pages/game/game.js
const app = getApp();
const api = require('../../services/api.js');

Page({
  data: {
    roomId: '',
    gameState: null,
    playerRole: null,
    currentPhase: '',
    currentRound: 1,
    teamLeaderIndex: 0,
    nominatedTeam: [],
    teamVotes: {},
    missionVotes: {},
    missionResults: [],
    showRoleModal: false,
    showVoteModal: false,
    showMissionModal: false,
    userInfo: null,
  },

  onLoad(options) {
    const { roomId } = options;
    this.setData({
      roomId: roomId || '',
      userInfo: app.globalData.userInfo,
    });

    this.initGamePolling();
    this.fetchGameState();
  },

  onUnload() {
    if (this.gamePolling) {
      clearInterval(this.gamePolling);
    }
  },

  initGamePolling() {
    this.gamePolling = setInterval(() => {
      this.fetchGameState();
    }, 2000);
  },

  fetchGameState() {
    const { roomId } = this.data;
    api.getGameState(roomId).then(res => {
      if (res.success && res.game) {
        this.setData({
          gameState: res.game,
          playerRole: res.playerRole,
          currentPhase: res.game.currentPhase || 'roleReveal',
          currentRound: res.game.currentRound || 1,
          teamLeaderIndex: res.game.teamLeaderIndex || 0,
          nominatedTeam: res.game.nominatedTeam || [],
          teamVotes: res.game.teamVotes || {},
          missionVotes: res.game.missionVotes || {},
          missionResults: res.game.missionResults || [],
        });

        if (res.game.currentPhase === 'gameEnd') {
          this.showGameEndResult(res.game.gameResult);
        }
      }
    }).catch(err => {
      console.error('获取游戏状态失败:', err);
    });
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

  viewRole() {
    const { playerRole } = this.data;
    if (!playerRole) return;

    const roleInfo = {
      'merlin': { name: '梅林', desc: '知道所有坏人（除莫德雷德），需要隐藏身份' },
      'percival': { name: '派西维尔', desc: '知道梅林和莫甘娜，需要保护梅林' },
      'loyal': { name: '忠臣', desc: '好人阵营，不知道其他角色身份' },
      'mordred': { name: '莫德雷德', desc: '坏人，梅林看不到他' },
      'morgana': { name: '莫甘娜', desc: '坏人，假扮梅林迷惑派西维尔' },
      'assassin': { name: '刺客', desc: '坏人，游戏结束时可以刺杀梅林' },
      'minion': { name: '爪牙', desc: '坏人，帮助破坏任务' },
      'oberon': { name: '奥伯伦', desc: '坏人，不知道其他坏人身份，坏人看不到他' },
      'lancelot': { name: '兰斯洛特', desc: '好人或坏人身份不确定，任务投票时可以故意输掉' },
      'ladyOfTheLake': { name: '湖中仙女', desc: '好人，可以使用湖中仙女技能查看其他玩家阵营' },
    };

    const info = roleInfo[playerRole] || { name: '未知', desc: '角色信息错误' };

    wx.showModal({
      title: `你的角色: ${info.name}`,
      content: info.desc,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  nominatePlayer(e) {
    const playerId = e.currentTarget.dataset.id;
    const { nominatedTeam } = this.data;
    const index = nominatedTeam.indexOf(playerId);

    if (index === -1) {
      if (nominatedTeam.length >= this.getRequiredTeamSize()) {
        wx.showToast({
          title: '队伍人数已满',
          icon: 'error',
        });
        return;
      }
      nominatedTeam.push(playerId);
    } else {
      nominatedTeam.splice(index, 1);
    }

    this.setData({ nominatedTeam });
    this.submitNomination();
  },

  getRequiredTeamSize() {
    const playerCount = this.data.gameState?.players?.length || 5;
    const round = this.data.currentRound;
    const sizes = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
      11: [3, 4, 4, 5, 5],
      12: [4, 5, 5, 6, 6],
    };
    return sizes[playerCount]?.[round - 1] || 3;
  },

  submitNomination() {
    const { roomId, nominatedTeam } = this.data;
    const isLeader = this.checkIfTeamLeader();

    if (!isLeader) return;

    api.submitNomination(roomId, nominatedTeam).then(res => {
      console.log('提名提交成功:', res);
    }).catch(err => {
      console.error('提名提交失败:', err);
    });
  },

  checkIfTeamLeader() {
    const { gameState } = this.data;
    if (!gameState || !gameState.players) return false;

    const currentLeader = gameState.players[gameState.teamLeaderIndex];
    return currentLeader?.openId === app.globalData.openId;
  },

  castVote(e) {
    const vote = e.currentTarget.dataset.vote;
    const { roomId } = this.data;

    api.castVote(roomId, vote).then(res => {
      console.log('投票成功:', res);
    }).catch(err => {
      console.error('投票失败:', err);
    });
  },

  castMissionVote(e) {
    const vote = e.currentTarget.dataset.vote;
    const { roomId, playerRole } = this.data;

    if (vote === 'fail') {
      const isEvil = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'].includes(playerRole);
      if (!isEvil) {
        wx.showToast({
          title: '只有坏人才能破坏任务',
          icon: 'error',
        });
        return;
      }
    }

    api.castMissionVote(roomId, vote, playerRole).then(res => {
      console.log('任务投票成功:', res);
    }).catch(err => {
      console.error('任务投票失败:', err);
    });
  },

  viewGameHistory() {
    const { missionResults } = this.data;

    let historyText = '任务历史:\n';
    missionResults.forEach((result, index) => {
      historyText += `第${index + 1}回合: ${result.success ? '成功' : '失败'}\n`;
    });

    wx.showModal({
      title: '游戏历史',
      content: historyText,
      showCancel: false,
      confirmText: '关闭'
    });
  },

  endGame() {
    wx.showModal({
      title: '结束游戏',
      content: '确定要结束游戏吗？',
      success: (res) => {
        if (res.confirm) {
          api.endGame(this.data.roomId).then(() => {
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
      'teamSelection': '队伍选择',
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
    const { gameState, teamLeaderIndex } = this.data;
    if (!gameState || !gameState.players || !gameState.players[teamLeaderIndex]) {
      return '未知';
    }
    return gameState.players[teamLeaderIndex].nickName;
  },

  getNominatedPlayers() {
    const { gameState, nominatedTeam } = this.data;
    if (!gameState || !gameState.players) return [];

    return gameState.players.filter(player =>
      nominatedTeam.includes(player.openId)
    );
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
    const successful = this.countSuccessfulMissions();
    if (successful >= 3) return 'good';
    return 'evil';
  },

  getPlayerSide(role) {
    const goodRoles = ['merlin', 'percival', 'loyal', 'lancelot', 'ladyOfTheLake'];
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
      'lancelot': '兰斯洛特',
      'ladyOfTheLake': '湖中仙女'
    };
    return roleNames[role] || '未知';
  },
});
