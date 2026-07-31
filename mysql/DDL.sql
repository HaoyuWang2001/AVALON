-- AVALON 数据库初始化脚本 v2.0
-- 游戏记录持久化 · 独立游戏ID · 用户当前房间

-- 删除旧库重建（全新部署）
DROP DATABASE IF EXISTS avalon_db;
CREATE DATABASE avalon_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE avalon_db;

-- =============================================
-- 1. users表：微信用户资料
-- =============================================
CREATE TABLE users (
    open_id VARCHAR(64) PRIMARY KEY COMMENT '微信openId',
    wx_nick_name VARCHAR(100) DEFAULT '' COMMENT '微信昵称',
    custom_nick_name VARCHAR(50) DEFAULT '' COMMENT '游戏内昵称',
    avatar_url TEXT COMMENT '头像路径',
    current_room_id VARCHAR(6) NULL COMMENT '当前所在房间号，NULL=不在任何房间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_current_room (current_room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- =============================================
-- 2. rooms表：房间基本信息
-- =============================================
CREATE TABLE rooms (
    id VARCHAR(6) PRIMARY KEY COMMENT '6位房间号',
    owner_id VARCHAR(64) NOT NULL COMMENT '房主openId（不可转让）',
    game_started BOOLEAN DEFAULT FALSE COMMENT '是否游戏进行中',
    room_config JSON NULL COMMENT '房间配置',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_updated_at (updated_at),
    INDEX idx_owner_id (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间表';

ALTER TABLE users ADD FOREIGN KEY (current_room_id) REFERENCES rooms(id) ON DELETE SET NULL;

-- =============================================
-- 3. players表：房间内的玩家
-- =============================================
CREATE TABLE players (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    room_id VARCHAR(6) NOT NULL COMMENT '房间ID',
    open_id VARCHAR(64) NOT NULL COMMENT '玩家openId',
    nick_name VARCHAR(100) NOT NULL DEFAULT '匿名玩家' COMMENT '游戏内昵称',
    wx_nick_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '微信昵称',
    avatar_url TEXT COMMENT '头像URL',
    seat_number INT NOT NULL COMMENT '座位号：-1=观战, 0=未入座, 1~N=入座',
    is_ready BOOLEAN DEFAULT FALSE COMMENT '是否已准备',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    seat_unique_for_game INT GENERATED ALWAYS AS (IF(seat_number >= 1, seat_number, NULL)) STORED COMMENT '浅席位唯一约束(仅>=1)',
    UNIQUE KEY uk_room_seat (room_id, seat_unique_for_game) COMMENT '同房间游戏座位号唯一(排除未入座/观战)',
    UNIQUE KEY uk_room_player (room_id, open_id) COMMENT '同房间玩家唯一',
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_open_id (open_id),
    INDEX idx_is_ready (is_ready)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='玩家表';

-- =============================================
-- 4. games表：游戏记录（持久化不删除）
-- =============================================
CREATE TABLE games (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID游戏ID',
    room_id VARCHAR(6) NULL COMMENT '房间ID（房间删除后置NULL，游戏记录保留）',
    owner_id VARCHAR(64) NOT NULL COMMENT '游戏所有者（从rooms.owner_id复制）',
    current_phase VARCHAR(50) DEFAULT 'waiting' COMMENT '当前阶段',
    current_round INT DEFAULT 1 COMMENT '当前回合(1-5)',
    team_leader_index INT DEFAULT 0 COMMENT '当前队长索引',
    nominated_team JSON COMMENT '提名的队伍',
    failed_nominations INT DEFAULT 0 COMMENT '连续失败提名次数',
    game_result JSON COMMENT '游戏结果',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态：active=进行中, ended=正常结束, abandoned=异常结束',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
    ended_at TIMESTAMP NULL COMMENT '结束时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    INDEX idx_room_id (room_id),
    INDEX idx_owner_id (owner_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏记录表（持久化）';

-- =============================================
-- 5. game_players表：游戏内玩家角色
-- =============================================
CREATE TABLE game_players (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    open_id VARCHAR(64) NOT NULL COMMENT '玩家openId',
    role VARCHAR(50) NOT NULL COMMENT '角色',
    side VARCHAR(10) NOT NULL COMMENT '阵营：good/evil',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',
    UNIQUE KEY uk_game_player (game_id, open_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    INDEX idx_side (side),
    INDEX idx_role (role),
    CHECK (side IN ('good', 'evil'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏玩家角色表';

-- =============================================
-- 6. votes表：投票记录
-- =============================================
CREATE TABLE votes (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    open_id VARCHAR(64) NOT NULL COMMENT '投票玩家',
    vote_type ENUM('team', 'mission') NOT NULL COMMENT '投票类型',
    vote_value VARCHAR(20) NOT NULL COMMENT '投票值',
    round INT NOT NULL COMMENT '第几回合',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
    UNIQUE KEY uk_vote_unique (game_id, open_id, vote_type, round),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_round (game_id, round, vote_type),
    INDEX idx_open_id (open_id),
    INDEX idx_created_at (created_at),
    CHECK (vote_value IN ('approve', 'reject', 'success', 'fail')),
    CHECK (round BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='投票表';

-- =============================================
-- 7. mission_results表：任务结果
-- =============================================
CREATE TABLE mission_results (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '回合数',
    success BOOLEAN NOT NULL COMMENT '是否成功',
    fail_count INT NOT NULL DEFAULT 0 COMMENT '失败票数',
    team JSON COMMENT '执行任务的队伍',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    UNIQUE KEY uk_game_round (game_id, round),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    INDEX idx_success (success),
    CHECK (round BETWEEN 1 AND 5),
    CHECK (fail_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务结果表';

-- =============================================
-- 8. messages表：聊天消息
-- =============================================
CREATE TABLE messages (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    room_id VARCHAR(6) NOT NULL COMMENT '房间ID',
    open_id VARCHAR(64) NOT NULL COMMENT '发送者openId',
    nick_name VARCHAR(100) NOT NULL COMMENT '发送者昵称',
    content TEXT NOT NULL COMMENT '消息内容',
    type VARCHAR(20) DEFAULT 'text' COMMENT '消息类型',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    INDEX idx_room_created (room_id, created_at DESC),
    INDEX idx_created_at (created_at),
    INDEX idx_open_id (open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';

-- =============================================
-- 9. role_configurations表：角色配置模板
-- =============================================
CREATE TABLE role_configurations (
    player_count INT PRIMARY KEY COMMENT '玩家数量',
    roles JSON NOT NULL COMMENT '角色配置数组',
    team_sizes JSON NOT NULL COMMENT '队伍大小配置',
    description VARCHAR(255) COMMENT '配置描述'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色配置表';

INSERT INTO role_configurations (player_count, roles, team_sizes, description) VALUES
(5, '["merlin", "percival", "loyal", "loyal", "loyal", "morgana", "assassin"]', '[2,3,2,3,3]', '5人推荐局（莫甘娜+刺客）'),
(6, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin"]', '[2,3,4,3,4]', '6人推荐局（莫甘娜+刺客）'),
(7, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "oberon"]', '[2,3,3,4,4]', '7人推荐局（莫甘娜+刺客+奥伯伦）'),
(8, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "minion"]', '[3,4,4,5,5]', '8人推荐局（莫甘娜+刺客+爪牙）'),
(9, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "mordred"]', '[3,4,4,5,5]', '9人推荐局（莫甘娜+刺客+莫德雷德）'),
(10, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "mordred", "oberon"]', '[3,4,4,5,5]', '10人推荐局（莫甘娜+刺客+莫德雷德+奥伯伦）'),
(11, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "loyal", "loyal", "morgana", "mordred", "oberon", "lancelotBlue", "lancelotRed"]', '[3,4,4,5,5]', '11人推荐局（含蓝红兰斯洛特）'),
(12, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "mordred", "oberon", "lancelotBlue", "lancelotRed"]', '[4,5,5,6,6]', '12人推荐局（含蓝红兰斯洛特）')
ON DUPLICATE KEY UPDATE roles=VALUES(roles), team_sizes=VALUES(team_sizes), description=VALUES(description);

-- =============================================
-- 初始化完成
-- =============================================
SELECT 'AVALON v2.0 数据库初始化完成' AS status;
