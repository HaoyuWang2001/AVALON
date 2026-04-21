-- AVALON游戏数据库初始化脚本
-- 版本：1.0.0
-- 创建时间：2026-04-17

-- 如果存在先删除数据库（仅用于初始化）
-- DROP DATABASE IF EXISTS avalon_db;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS avalon_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE avalon_db;



-- =============================================
-- 1. rooms表：存储房间基本信息
-- =============================================
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(6) PRIMARY KEY COMMENT '6位房间号',
    host_open_id VARCHAR(255) NOT NULL COMMENT '房主openId',
    game_started BOOLEAN DEFAULT FALSE COMMENT '游戏是否开始',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_updated_at (updated_at),
    INDEX idx_host_open_id (host_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间表';

-- =============================================
-- 2. players表：存储房间内的玩家信息
-- =============================================
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    room_id VARCHAR(6) NOT NULL COMMENT '外键到rooms',
    open_id VARCHAR(255) NOT NULL COMMENT '玩家微信openId',
    nick_name VARCHAR(100) NOT NULL DEFAULT '匿名玩家' COMMENT '玩家昵称',
    avatar_url TEXT COMMENT '头像URL',
    seat_number INT NOT NULL COMMENT '座位号1-12',
    is_host BOOLEAN DEFAULT FALSE COMMENT '是否为房主',
    is_ready BOOLEAN DEFAULT FALSE COMMENT '是否已准备',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    -- 唯一约束
    UNIQUE KEY uk_room_seat (room_id, seat_number) COMMENT '同一房间内座位号唯一',
    UNIQUE KEY uk_room_player (room_id, open_id) COMMENT '同一房间内玩家唯一',
    -- 外键约束
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    -- 索引
    INDEX idx_room_id (room_id),
    INDEX idx_open_id (open_id),
    INDEX idx_is_ready (is_ready),
    -- 检查约束（MySQL通过触发器或应用层实现）
    CHECK (seat_number BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='玩家表';

-- =============================================
-- 3. games表：存储游戏状态
-- =============================================
CREATE TABLE IF NOT EXISTS games (
    room_id VARCHAR(6) PRIMARY KEY COMMENT '与rooms一对一',
    current_phase VARCHAR(50) DEFAULT 'waiting' COMMENT '当前阶段: waiting, roleReveal, teamSelection, teamVote, missionVote, gameEnd',
    current_round INT DEFAULT 1 COMMENT '当前回合(1-5)',
    team_leader_index INT DEFAULT 0 COMMENT '当前队长索引',
    nominated_team JSON COMMENT '提名的队伍(openId数组)',
    failed_nominations INT DEFAULT 0 COMMENT '连续失败提名次数',
    game_result JSON COMMENT '游戏结果: {"winner": "good/evil", "reason": "描述"}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    -- 外键约束
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    -- 索引
    INDEX idx_current_phase (current_phase),
    INDEX idx_updated_at (updated_at),
    -- 检查约束
    CHECK (current_round BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏状态表';

-- =============================================
-- 4. game_players表：存储游戏中玩家的角色
-- =============================================
CREATE TABLE IF NOT EXISTS game_players (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(6) NOT NULL COMMENT '外键到games.room_id',
    open_id VARCHAR(255) NOT NULL COMMENT '玩家openId',
    role VARCHAR(50) NOT NULL COMMENT '角色: merlin, percival, loyal, mordred, morgana, assassin, minion, oberon, lancelot, ladyOfTheLake',
    side VARCHAR(10) NOT NULL COMMENT '阵营: good/evil',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',
    -- 唯一约束
    UNIQUE KEY uk_game_player (game_id, open_id) COMMENT '同一游戏中玩家唯一',
    -- 外键约束
    FOREIGN KEY (game_id) REFERENCES games(room_id) ON DELETE CASCADE,
    -- 索引
    INDEX idx_game_id (game_id),
    INDEX idx_side (side),
    INDEX idx_role (role),
    -- 检查约束
    CHECK (side IN ('good', 'evil'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏玩家角色表';

-- =============================================
-- 5. votes表：统一存储投票信息
-- =============================================
CREATE TABLE IF NOT EXISTS votes (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(6) NOT NULL COMMENT '外键到games',
    open_id VARCHAR(255) NOT NULL COMMENT '投票玩家',
    vote_type ENUM('team', 'mission') NOT NULL COMMENT '投票类型',
    vote_value VARCHAR(20) NOT NULL COMMENT '投票值: approve/reject 或 success/fail',
    round INT NOT NULL COMMENT '第几回合',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
    -- 唯一约束：每个玩家每回合每种类型只能投一次
    UNIQUE KEY uk_vote_unique (game_id, open_id, vote_type, round) COMMENT '唯一投票约束',
    -- 外键约束
    FOREIGN KEY (game_id) REFERENCES games(room_id) ON DELETE CASCADE,
    -- 索引
    INDEX idx_game_round (game_id, round, vote_type),
    INDEX idx_open_id (open_id),
    INDEX idx_created_at (created_at),
    -- 检查约束
    CHECK (vote_value IN ('approve', 'reject', 'success', 'fail')),
    CHECK (round BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='投票表';

-- =============================================
-- 6. mission_results表：存储任务结果
-- =============================================
CREATE TABLE IF NOT EXISTS mission_results (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(6) NOT NULL COMMENT '外键到games',
    round INT NOT NULL COMMENT '回合数',
    success BOOLEAN NOT NULL COMMENT '是否成功',
    fail_count INT NOT NULL DEFAULT 0 COMMENT '失败票数',
    team JSON COMMENT '执行任务的队伍(openId数组)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    -- 唯一约束：同一游戏同一回合只能有一个结果
    UNIQUE KEY uk_game_round (game_id, round) COMMENT '同一游戏回合结果唯一',
    -- 外键约束
    FOREIGN KEY (game_id) REFERENCES games(room_id) ON DELETE CASCADE,
    -- 索引
    INDEX idx_game_id (game_id),
    INDEX idx_success (success),
    -- 检查约束
    CHECK (round BETWEEN 1 AND 5),
    CHECK (fail_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务结果表';

-- =============================================
-- 7. messages表：存储聊天消息
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    room_id VARCHAR(6) NOT NULL COMMENT '房间ID',
    open_id VARCHAR(255) NOT NULL COMMENT '发送者openId',
    nick_name VARCHAR(100) NOT NULL COMMENT '发送者昵称',
    content TEXT NOT NULL COMMENT '消息内容',
    type VARCHAR(20) DEFAULT 'text' COMMENT '消息类型: text, system, action',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    -- 外键约束
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    -- 索引：按房间和时间排序查询
    INDEX idx_room_created (room_id, created_at DESC),
    INDEX idx_created_at (created_at),
    INDEX idx_open_id (open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';

-- =============================================
-- 8. 游戏历史记录表（可选）
-- =============================================
CREATE TABLE IF NOT EXISTS game_history (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    room_id VARCHAR(6) NULL COMMENT '房间ID',
    game_data JSON NOT NULL COMMENT '完整游戏数据快照',
    winner VARCHAR(10) NOT NULL COMMENT '胜利阵营: good/evil',
    player_count INT NOT NULL COMMENT '玩家数量',
    duration_seconds INT COMMENT '游戏持续时间(秒)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    -- 索引
    INDEX idx_created_at (created_at),
    INDEX idx_winner (winner),
    INDEX idx_player_count (player_count),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏历史记录表';

-- =============================================
-- 9. 创建必要的视图
-- =============================================

-- 房间详情视图
CREATE OR REPLACE VIEW room_details AS
SELECT 
    r.id AS room_id,
    r.host_open_id,
    r.game_started,
    r.created_at AS room_created_at,
    r.updated_at AS room_updated_at,
    COUNT(p.id) AS player_count,
    SUM(CASE WHEN p.is_ready THEN 1 ELSE 0 END) AS ready_count,
    GROUP_CONCAT(CONCAT(p.nick_name, '#', p.seat_number) ORDER BY p.seat_number) AS players_info
FROM rooms r
LEFT JOIN players p ON r.id = p.room_id
GROUP BY r.id, r.host_open_id, r.game_started, r.created_at, r.updated_at;

-- 游戏详情视图
CREATE OR REPLACE VIEW game_details AS
SELECT 
    g.room_id,
    g.current_phase,
    g.current_round,
    g.team_leader_index,
    g.failed_nominations,
    g.created_at AS game_started_at,
    g.updated_at AS game_updated_at,
    COUNT(DISTINCT gp.open_id) AS total_players,
    COUNT(DISTINCT CASE WHEN gp.side = 'good' THEN gp.open_id END) AS good_players,
    COUNT(DISTINCT CASE WHEN gp.side = 'evil' THEN gp.open_id END) AS evil_players,
    GROUP_CONCAT(DISTINCT gp.role) AS roles_in_game
FROM games g
LEFT JOIN game_players gp ON g.room_id = gp.game_id
GROUP BY g.room_id, g.current_phase, g.current_round, g.team_leader_index, 
         g.failed_nominations, g.created_at, g.updated_at;

-- =============================================
-- 10. 创建存储过程（可选）
-- =============================================

-- 清理过期房间的存储过程（30天未更新）
-- 先删除已存在的存储过程（如果存在）
DROP PROCEDURE IF EXISTS cleanup_old_rooms;

DELIMITER //
CREATE PROCEDURE cleanup_old_rooms(IN days_old INT)
BEGIN
    DECLARE cutoff_date DATETIME;
    SET cutoff_date = DATE_SUB(NOW(), INTERVAL days_old DAY);
    
    -- 删除过期的房间（级联删除相关记录）
    DELETE FROM rooms WHERE updated_at < cutoff_date AND game_started = FALSE;
    
    SELECT ROW_COUNT() AS rooms_deleted;
END //
DELIMITER ;

-- =============================================
-- 11. 创建触发器
-- =============================================

-- 当游戏结束时，自动记录到历史表
-- 先删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS after_game_end;

DELIMITER //
CREATE TRIGGER after_game_end
AFTER UPDATE ON games
FOR EACH ROW
BEGIN
    IF OLD.current_phase != 'gameEnd' AND NEW.current_phase = 'gameEnd' AND NEW.game_result IS NOT NULL THEN
        INSERT INTO game_history (room_id, game_data, winner, player_count)
        SELECT 
            NEW.room_id,
            JSON_OBJECT(
                'game', JSON_OBJECT(
                    'room_id', NEW.room_id,
                    'current_phase', NEW.current_phase,
                    'current_round', NEW.current_round,
                    'team_leader_index', NEW.team_leader_index,
                    'nominated_team', NEW.nominated_team,
                    'failed_nominations', NEW.failed_nominations,
                    'game_result', NEW.game_result,
                    'created_at', NEW.created_at,
                    'updated_at', NEW.updated_at
                ),
                'players', (SELECT JSON_ARRAYAGG(JSON_OBJECT('open_id', open_id, 'role', role, 'side', side)) 
                           FROM game_players WHERE game_id = NEW.room_id),
                'mission_results', (SELECT JSON_ARRAYAGG(JSON_OBJECT('round', round, 'success', success, 'fail_count', fail_count)) 
                                   FROM mission_results WHERE game_id = NEW.room_id ORDER BY round),
                'votes', (SELECT COUNT(*) FROM votes WHERE game_id = NEW.room_id)
            ),
            JSON_UNQUOTE(JSON_EXTRACT(NEW.game_result, '$.winner')),
            (SELECT COUNT(*) FROM game_players WHERE game_id = NEW.room_id);
    END IF;
END //
DELIMITER ;

-- =============================================
-- 12. 插入初始数据（角色配置）
-- =============================================

-- 创建角色配置表（用于参考）
CREATE TABLE IF NOT EXISTS role_configurations (
    player_count INT PRIMARY KEY COMMENT '玩家数量',
    roles JSON NOT NULL COMMENT '角色配置数组',
    team_sizes JSON NOT NULL COMMENT '队伍大小配置[2,3,2,3,3]',
    description VARCHAR(255) COMMENT '配置描述'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色配置表';

-- 插入标准角色配置
INSERT INTO role_configurations (player_count, roles, team_sizes, description) VALUES
(5, '["merlin", "percival", "loyal", "mordred", "assassin"]', '[2,3,2,3,3]', '5人标准局'),
(6, '["merlin", "percival", "loyal", "loyal", "mordred", "assassin"]', '[2,3,4,3,4]', '6人标准局'),
(7, '["merlin", "percival", "loyal", "loyal", "mordred", "morgana", "assassin"]', '[2,3,3,4,4]', '7人标准局'),
(8, '["merlin", "percival", "loyal", "loyal", "loyal", "mordred", "morgana", "assassin"]', '[3,4,4,5,5]', '8人标准局'),
(9, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "mordred", "morgana", "assassin"]', '[3,4,4,5,5]', '9人标准局'),
(10, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "mordred", "morgana", "assassin", "minion"]', '[3,4,4,5,5]', '10人标准局'),
(11, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "mordred", "morgana", "assassin", "minion", "lancelot"]', '[3,4,4,5,5]', '11人标准局（含兰斯洛特）'),
(12, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "mordred", "morgana", "assassin", "minion", "oberon", "lancelot"]', '[4,5,5,6,6]', '12人标准局（含奥伯伦和兰斯洛特）')
ON DUPLICATE KEY UPDATE 
    roles = VALUES(roles),
    team_sizes = VALUES(team_sizes),
    description = VALUES(description);

-- =============================================
-- 完成信息
-- =============================================
SELECT '=============================================';
SELECT 'AVALON数据库初始化完成';
SELECT '=============================================';

-- 表统计
SELECT 
    CONCAT('表: ', COUNT(*), ' 个') AS summary,
    GROUP_CONCAT(TABLE_NAME ORDER BY TABLE_NAME) AS tables
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'avalon_db' 
  AND TABLE_TYPE = 'BASE TABLE';

-- 视图统计  
SELECT 
    CONCAT('视图: ', COUNT(*), ' 个') AS summary,
    GROUP_CONCAT(TABLE_NAME ORDER BY TABLE_NAME) AS views
FROM information_schema.VIEWS 
WHERE TABLE_SCHEMA = 'avalon_db';

-- 触发器统计
SELECT 
    CONCAT('触发器: ', COUNT(*), ' 个') AS summary,
    GROUP_CONCAT(TRIGGER_NAME ORDER BY TRIGGER_NAME) AS triggers
FROM information_schema.TRIGGERS 
WHERE TRIGGER_SCHEMA = 'avalon_db';

-- 存储过程统计
SELECT 
    CONCAT('存储过程: ', COUNT(*), ' 个') AS summary,
    GROUP_CONCAT(ROUTINE_NAME ORDER BY ROUTINE_NAME) AS procedures
FROM information_schema.ROUTINES 
WHERE ROUTINE_SCHEMA = 'avalon_db' 
  AND ROUTINE_TYPE = 'PROCEDURE';

-- 角色配置详细信息
SELECT '角色配置详情 (5-12人标准局):';
SELECT 
    CONCAT(player_count, '人: ', description) AS configuration,
    CONCAT('角色: ', roles) AS roles,
    CONCAT('队伍: ', team_sizes) AS teams
FROM role_configurations 
ORDER BY player_count;

SELECT '=============================================';
SELECT '数据库初始化验证完成，所有对象创建成功！';
SELECT '=============================================';