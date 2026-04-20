// 游戏数据模型
const db = require('../config/db');

class GameModel {
  /**
   * 开始游戏
   * @param {string} roomId 房间ID
   * @returns {Promise<Object>} 游戏信息
   */
  static async start(roomId) {
    try {
      let game = null;
      
      await db.transaction(async (connection) => {
        // 1. 获取房间和玩家信息
        const [roomInfo] = await connection.execute(
          `SELECT r.host_open_id, COUNT(p.id) as player_count,
                  SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) as ready_count
           FROM rooms r
           LEFT JOIN players p ON r.id = p.room_id
           WHERE r.id = ? AND r.game_started = FALSE
           GROUP BY r.host_open_id
           FOR UPDATE`,
          [roomId]
        );
        
        if (roomInfo.length === 0) {
          throw new Error('房间不存在或游戏已开始');
        }
        
        const playerCount = parseInt(roomInfo[0].player_count);
        const readyCount = parseInt(roomInfo[0].ready_count);
        
        // 验证游戏开始条件
        if (playerCount < 5) {
          throw new Error('至少需要5人才能开始游戏');
        }
        
        if (readyCount < playerCount) {
          throw new Error('还有玩家未准备');
        }
        
        // 2. 获取已排序的玩家列表
        const [players] = await connection.execute(
          `SELECT open_id as openId, nick_name as nickName, avatar_url as avatarUrl, seat_number as seatNumber
           FROM players WHERE room_id = ? ORDER BY seat_number`,
          [roomId]
        );
        
        // 3. 分配角色（简化版，实际应根据配置分配）
        const roles = this.getRoleConfiguration(playerCount);
        const shuffledRoles = this.shuffleArray(roles);
        
        // 4. 创建游戏记录
        await connection.execute(
          `INSERT INTO games (room_id, current_phase, current_round, team_leader_index, 
                             failed_nominations, created_at, updated_at)
           VALUES (?, 'roleReveal', 1, 0, 0, NOW(), NOW())`,
          [roomId]
        );
        
        // 5. 添加游戏玩家角色
        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          const role = shuffledRoles[i];
          const side = this.getRoleSide(role);
          
          await connection.execute(
            `INSERT INTO game_players (game_id, open_id, role, side, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [roomId, player.openId, role, side]
          );
        }
        
        // 6. 更新房间状态
        await connection.execute(
          'UPDATE rooms SET game_started = TRUE, updated_at = NOW() WHERE id = ?',
          [roomId]
        );
        
        // 7. 组装游戏数据
        const playersWithRoles = players.map((player, index) => ({
          ...player,
          role: shuffledRoles[index],
          side: this.getRoleSide(shuffledRoles[index])
        }));
        
        game = {
          roomId,
          players: playersWithRoles,
          currentPhase: 'roleReveal',
          currentRound: 1,
          teamLeaderIndex: 0,
          nominatedTeam: [],
          teamVotes: {},
          missionVotes: {},
          missionResults: [],
          failedNominations: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });
      
      return game;
    } catch (error) {
      console.error('开始游戏失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取游戏状态
   * @param {string} roomId 房间ID
   * @param {string} openId 玩家openId（可选）
   * @returns {Promise<Object>} 游戏状态
   */
  static async getState(roomId, openId = null) {
    try {
      // 获取游戏基本信息
      const [games] = await db.query(
        `SELECT room_id as roomId, current_phase as currentPhase, current_round as currentRound,
                team_leader_index as teamLeaderIndex, nominated_team as nominatedTeam,
                failed_nominations as failedNominations, game_result as gameResult,
                created_at as createdAt, updated_at as updatedAt
         FROM games WHERE room_id = ?`,
        [roomId]
      );
      
      if (games.length === 0) {
        throw new Error('游戏不存在');
      }
      
      const game = games[0];
      
      // 解析JSON字段
      if (game.nominatedTeam) {
        game.nominatedTeam = JSON.parse(game.nominatedTeam);
      }
      if (game.gameResult) {
        game.gameResult = JSON.parse(game.gameResult);
      }
      
      // 获取游戏玩家
      const [players] = await db.query(
        `SELECT gp.open_id as openId, gp.role, gp.side,
                p.nick_name as nickName, p.avatar_url as avatarUrl, p.seat_number as seatNumber
         FROM game_players gp
         JOIN players p ON gp.open_id = p.open_id AND p.room_id = ?
         WHERE gp.game_id = ?
         ORDER BY p.seat_number`,
        [roomId, roomId]
      );
      
      game.players = players;
      
      // 获取当前回合的投票信息
      const [teamVotes] = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'team' AND round = ?
         ORDER BY created_at`,
        [roomId, game.currentRound]
      );
      
      const [missionVotes] = await db.query(
        `SELECT open_id, vote_value 
         FROM votes 
         WHERE game_id = ? AND vote_type = 'mission' AND round = ?
         ORDER BY created_at`,
        [roomId, game.currentRound]
      );
      
      // 转换为对象格式
      game.teamVotes = {};
      game.missionVotes = {};
      
      teamVotes.forEach(vote => {
        game.teamVotes[vote.open_id] = vote.vote_value;
      });
      
      missionVotes.forEach(vote => {
        game.missionVotes[vote.open_id] = vote.vote_value;
      });
      
      // 获取任务结果
      const [missionResults] = await db.query(
        `SELECT round, success, fail_count as failCount, team
         FROM mission_results 
         WHERE game_id = ? 
         ORDER BY round`,
        [roomId]
      );
      
      game.missionResults = missionResults.map(result => ({
        round: result.round,
        success: result.success === 1,
        failCount: result.failCount,
        team: result.team ? JSON.parse(result.team) : []
      }));
      
      // 如果指定了玩家，返回玩家角色
      let playerRole = null;
      if (openId) {
        const player = players.find(p => p.openId === openId);
        if (player) {
          playerRole = player.role;
        }
      }
      
      return {
        success: true,
        game,
        playerRole
      };
    } catch (error) {
      console.error('获取游戏状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 提交提名队伍
   * @param {string} roomId 房间ID
   * @param {string} openId 队长openId
   * @param {Array<string>} nominatedTeam 提名队伍openId数组
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async submitNomination(roomId, openId, nominatedTeam) {
    try {
      await db.transaction(async (connection) => {
        // 验证游戏状态和队长身份
        const [game] = await connection.execute(
          `SELECT current_phase, team_leader_index, 
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE room_id = ? FOR UPDATE`,
          [roomId, roomId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'teamSelection') {
          throw new Error('当前不是队伍选择阶段');
        }
        
        // 验证队长身份
        const [players] = await connection.execute(
          `SELECT open_id FROM game_players WHERE game_id = ? ORDER BY open_id`,
          [roomId]
        );
        
        const teamLeaderIndex = game[0].team_leader_index;
        if (teamLeaderIndex >= players.length || players[teamLeaderIndex].open_id !== openId) {
          throw new Error('只有队长才能提名');
        }
        
        // 验证队伍大小
        const playerCount = game[0].player_count;
        const requiredSize = this.getTeamSize(playerCount, game[0].current_round);
        if (nominatedTeam.length !== requiredSize) {
          throw new Error(`需要${requiredSize}人`);
        }
        
        // 更新提名队伍和阶段
        await connection.execute(
          `UPDATE games 
           SET current_phase = 'teamVote', 
               nominated_team = ?,
               updated_at = NOW()
           WHERE room_id = ?`,
          [JSON.stringify(nominatedTeam), roomId]
        );
      });
      
      return await this.getState(roomId);
    } catch (error) {
      console.error('提交提名失败:', error);
      throw error;
    }
  }
  
  /**
   * 投票
   * @param {string} roomId 房间ID
   * @param {string} openId 投票玩家openId
   * @param {string} vote 投票值 ('approve' 或 'reject')
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async castVote(roomId, openId, vote) {
    try {
      await db.transaction(async (connection) => {
        // 获取游戏状态
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, 
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE room_id = ? FOR UPDATE`,
          [roomId, roomId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'teamVote') {
          throw new Error('当前不是投票阶段');
        }
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'team' AND round = ?`,
          [roomId, openId, game[0].current_round]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, created_at)
           VALUES (?, ?, 'team', ?, ?, NOW())`,
          [roomId, openId, vote, game[0].current_round]
        );
        
        // 检查是否所有玩家都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'team' AND round = ?`,
          [roomId, game[0].current_round]
        );
        
        const playerCount = game[0].player_count;
        
        if (voteCount[0].count >= playerCount) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'team' AND round = ?`,
            [roomId, game[0].current_round]
          );
          
          const approveCount = votes.filter(v => v.vote_value === 'approve').length;
          const rejectCount = votes.filter(v => v.vote_value === 'reject').length;
          
          if (approveCount > rejectCount) {
            // 投票通过，进入任务投票阶段
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'missionVote',
                   updated_at = NOW()
               WHERE room_id = ?`,
              [roomId]
            );
          } else {
            // 投票否决
            const failedNominations = game[0].failed_nominations + 1;
            
            if (failedNominations >= 5) {
              // 连续5次提名被否决，坏人直接获胜
              await connection.execute(
                `UPDATE games 
                 SET current_phase = 'gameEnd',
                     game_result = ?,
                     updated_at = NOW()
                 WHERE room_id = ?`,
                [JSON.stringify({ winner: 'evil', reason: '连续5次提名被否决' }), roomId]
              );
            } else {
              // 更换队长，进入下一轮提名
              const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;
              
              await connection.execute(
                `UPDATE games 
                 SET current_phase = 'teamSelection',
                     team_leader_index = ?,
                     nominated_team = NULL,
                     failed_nominations = ?,
                     updated_at = NOW()
                 WHERE room_id = ?`,
                [newTeamLeaderIndex, failedNominations, roomId]
              );
            }
          }
        }
      });
      
      return await this.getState(roomId);
    } catch (error) {
      console.error('投票失败:', error);
      throw error;
    }
  }
  
  /**
   * 任务投票
   * @param {string} roomId 房间ID
   * @param {string} openId 投票玩家openId
   * @param {string} vote 投票值 ('success' 或 'fail')
   * @param {string} playerRole 玩家角色
   * @returns {Promise<Object>} 更新后的游戏状态
   */
  static async castMissionVote(roomId, openId, vote, playerRole) {
    try {
      await db.transaction(async (connection) => {
        // 获取游戏状态
        const [game] = await connection.execute(
          `SELECT current_phase, current_round, nominated_team,
                  (SELECT COUNT(*) FROM game_players WHERE game_id = ?) as player_count
           FROM games WHERE room_id = ? FOR UPDATE`,
          [roomId, roomId]
        );
        
        if (game.length === 0) {
          throw new Error('游戏不存在');
        }
        
        if (game[0].current_phase !== 'missionVote') {
          throw new Error('当前不是任务投票阶段');
        }
        
        // 验证坏人才能投失败票
        if (vote === 'fail') {
          const isEvil = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'].includes(playerRole);
          if (!isEvil) {
            throw new Error('只有坏人才能破坏任务');
          }
        }
        
        // 检查是否已投票
        const [existingVote] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND open_id = ? AND vote_type = 'mission' AND round = ?`,
          [roomId, openId, game[0].current_round]
        );
        
        if (existingVote[0].count > 0) {
          throw new Error('已投票');
        }
        
        // 记录投票
        await connection.execute(
          `INSERT INTO votes (game_id, open_id, vote_type, vote_value, round, created_at)
           VALUES (?, ?, 'mission', ?, ?, NOW())`,
          [roomId, openId, vote, game[0].current_round]
        );
        
        // 检查是否所有玩家都已投票
        const [voteCount] = await connection.execute(
          `SELECT COUNT(*) as count FROM votes 
           WHERE game_id = ? AND vote_type = 'mission' AND round = ?`,
          [roomId, game[0].current_round]
        );
        
        const playerCount = game[0].player_count;
        
        if (voteCount[0].count >= playerCount) {
          // 统计投票结果
          const [votes] = await connection.execute(
            `SELECT vote_value FROM votes 
             WHERE game_id = ? AND vote_type = 'mission' AND round = ?`,
            [roomId, game[0].current_round]
          );
          
          const failCount = votes.filter(v => v.vote_value === 'fail').length;
          
          // 解析提名队伍大小
          const nominatedTeam = game[0].nominated_team ? JSON.parse(game[0].nominated_team) : [];
          const teamSize = nominatedTeam.length;
          
          // 判断任务是否成功
          const success = failCount === 0 || (teamSize > 1 && failCount === 1);
          
          // 保存任务结果
          await connection.execute(
            `INSERT INTO mission_results (game_id, round, success, fail_count, team, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [roomId, game[0].current_round, success, failCount, JSON.stringify(nominatedTeam)]
          );
          
          // 获取已成功任务数量
          const [successCountResult] = await connection.execute(
            `SELECT COUNT(*) as count FROM mission_results 
             WHERE game_id = ? AND success = TRUE`,
            [roomId]
          );
          
          const successCount = successCountResult[0].count;
          
          // 检查游戏是否结束
          if (successCount >= 3) {
            // 好人完成3个任务，好人胜利
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'gameEnd',
                   game_result = ?,
                   updated_at = NOW()
               WHERE room_id = ?`,
              [JSON.stringify({ winner: 'good', reason: '好人完成3个任务' }), roomId]
            );
          } else if (game[0].current_round >= 5) {
            // 5回合结束，坏人胜利
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'gameEnd',
                   game_result = ?,
                   updated_at = NOW()
               WHERE room_id = ?`,
              [JSON.stringify({ winner: 'evil', reason: '坏人完成3个任务' }), roomId]
            );
          } else {
            // 进入下一回合
            const newRound = game[0].current_round + 1;
            const newTeamLeaderIndex = (game[0].team_leader_index + 1) % playerCount;
            
            await connection.execute(
              `UPDATE games 
               SET current_phase = 'teamSelection',
                   current_round = ?,
                   team_leader_index = ?,
                   nominated_team = NULL,
                   updated_at = NOW()
               WHERE room_id = ?`,
              [newRound, newTeamLeaderIndex, roomId]
            );
          }
        }
      });
      
      return await this.getState(roomId);
    } catch (error) {
      console.error('任务投票失败:', error);
      throw error;
    }
  }
  
  /**
   * 结束游戏
   * @param {string} roomId 房间ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async end(roomId) {
    try {
      await db.transaction(async (connection) => {
        // 删除游戏记录（触发器会自动处理游戏历史）
        await connection.execute('DELETE FROM games WHERE room_id = ?', [roomId]);
        
        // 重置房间状态
        await connection.execute(
          `UPDATE rooms 
           SET game_started = FALSE, 
               updated_at = NOW() 
           WHERE id = ?`,
          [roomId]
        );
        
        // 重置玩家准备状态
        await connection.execute(
          `UPDATE players 
           SET is_ready = FALSE 
           WHERE room_id = ?`,
          [roomId]
        );
      });
      
      return true;
    } catch (error) {
      console.error('结束游戏失败:', error);
      throw error;
    }
  }
  
  // =============== 工具方法 ===============
  
  /**
   * 根据玩家数量获取角色配置
   * @param {number} playerCount 玩家数量
   * @returns {Array<string>} 角色数组
   */
  static getRoleConfiguration(playerCount) {
    const configs = {
      5: ['merlin', 'percival', 'loyal', 'mordred', 'assassin'],
      6: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'assassin'],
      7: ['merlin', 'percival', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
      8: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
      9: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin'],
      10: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion'],
      11: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion', 'lancelot'],
      12: ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'mordred', 'morgana', 'assassin', 'minion', 'oberon', 'lancelot']
    };
    
    return configs[playerCount] || configs[5];
  }
  
  /**
   * 获取角色阵营
   * @param {string} role 角色
   * @returns {string} 'good' 或 'evil'
   */
  static getRoleSide(role) {
    const goodRoles = ['merlin', 'percival', 'loyal', 'lancelot', 'ladyOfTheLake'];
    const evilRoles = ['mordred', 'morgana', 'assassin', 'minion', 'oberon'];
    
    if (goodRoles.includes(role)) return 'good';
    if (evilRoles.includes(role)) return 'evil';
    return 'good';
  }
  
  /**
   * 获取队伍大小
   * @param {number} playerCount 玩家数量
   * @param {number} round 回合数(1-5)
   * @returns {number} 队伍大小
   */
  static getTeamSize(playerCount, round) {
    const teamSizes = {
      5: [2, 3, 2, 3, 3],
      6: [2, 3, 4, 3, 4],
      7: [2, 3, 3, 4, 4],
      8: [3, 4, 4, 5, 5],
      9: [3, 4, 4, 5, 5],
      10: [3, 4, 4, 5, 5],
      11: [3, 4, 4, 5, 5],
      12: [4, 5, 5, 6, 6]
    };
    
    const sizes = teamSizes[playerCount] || teamSizes[5];
    return sizes[round - 1] || 3;
  }
  
  /**
   * 随机打乱数组
   * @param {Array} array 原始数组
   * @returns {Array} 打乱后的数组
   */
  static shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
  
  /**
   * 获取游戏统计信息
   * @returns {Promise<Object>} 统计信息
   */
  static async getStats() {
    try {
      const [totalGames] = await db.query('SELECT COUNT(*) as count FROM games');
      const [activeGames] = await db.query(
        `SELECT COUNT(*) as count FROM games g
         JOIN rooms r ON g.room_id = r.id
         WHERE r.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`
      );
      const [gamesByPhase] = await db.query(
        'SELECT current_phase, COUNT(*) as count FROM games GROUP BY current_phase'
      );
      const [completedGames] = await db.query(
        `SELECT COUNT(*) as count FROM game_history`
      );
      
      return {
        totalGames: totalGames[0].count,
        activeGames: activeGames[0].count,
        completedGames: completedGames[0].count,
        gamesByPhase: gamesByPhase.reduce((acc, row) => {
          acc[row.current_phase] = row.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('获取游戏统计失败:', error);
      throw error;
    }
  }
}

module.exports = GameModel;