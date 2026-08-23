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
    unique_id VARCHAR(32) NULL COMMENT '用户自选唯一ID(1-16位,中文/英文/数字/-/_)',
    unique_id_updated_at DATETIME NULL COMMENT 'unique_id最近设置/修改时间(每日一次)',
    last_seen_at DATETIME NULL COMMENT '最近活跃时间(混合判定在线用)',
    avatar_url TEXT COMMENT '头像路径',
    current_room_id VARCHAR(6) NULL COMMENT '当前所在房间号，NULL=不在任何房间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_current_room (current_room_id),
    UNIQUE KEY uniq_unique_id (unique_id)
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
-- 3. room_players表：房间内的玩家
-- =============================================
CREATE TABLE room_players (
    open_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '玩家openId（主键，一人一行）',
    room_id VARCHAR(6) NOT NULL COMMENT '房间ID',
    nick_name VARCHAR(100) NOT NULL DEFAULT '匿名玩家' COMMENT '游戏内昵称',
    wx_nick_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '微信昵称',
    avatar_url TEXT COMMENT '头像URL',
    seat_number INT NOT NULL COMMENT '座位号：-1=观战, 0=未入座, 1~N=入座',
    is_ready BOOLEAN DEFAULT FALSE COMMENT '是否已准备',
    banned_from_seating BOOLEAN DEFAULT FALSE COMMENT '是否禁止上座',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    seat_unique_for_game INT GENERATED ALWAYS AS (IF(seat_number >= 1, seat_number, NULL)) STORED COMMENT '游戏座位唯一约束(仅>=1)',
    UNIQUE KEY uk_room_seat (room_id, seat_unique_for_game) COMMENT '同房间游戏座位号唯一(排除未入座/观战)',
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    INDEX idx_room_id (room_id),
    INDEX idx_is_ready (is_ready)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间玩家表';

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
    lake_holder_open_id VARCHAR(64) NULL COMMENT '当前湖仙持有者',
    pre_nominated_team JSON NULL COMMENT '讨论期预提名队伍（一次设置不可改）',
    speaking_order VARCHAR(10) DEFAULT 'asc' COMMENT '发言顺序：asc/desc',
    discussion_set BOOLEAN DEFAULT FALSE COMMENT '本轮讨论是否已设置发言配置（一次不可改）',
    lancelot_result JSON NULL COMMENT '兰斯抽卡结果 {switched, round}',
    vote_reveal_end_at DATETIME NULL COMMENT '队伍投票票型展示阶段结束时间（teamVoteReveal 阶段，后端推进）',
    forced_car BOOLEAN DEFAULT FALSE COMMENT '当前车是否为强制车（forcedCar 发车，直接进入 missionVote）',
    assassination JSON NULL COMMENT '刺杀记录: {killer, target, correct, phase, round}',
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
    nick_name VARCHAR(64) NULL COMMENT '游戏开始时快照昵称',
    avatar_url VARCHAR(512) NULL COMMENT '游戏开始时快照头像',
    seat_number INT NULL COMMENT '游戏开始时座位号',
    reveal_confirmed BOOLEAN DEFAULT FALSE COMMENT '角色揭示是否已确认（全员确认后进入讨论）',
    lancelot_confirmed BOOLEAN DEFAULT FALSE COMMENT '兰斯抽卡是否已确认（全员确认后进入下一轮）',
    lake_confirmed BOOLEAN DEFAULT FALSE COMMENT '湖仙查验是否已确认（全员确认后进入下一阶段）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',
    UNIQUE KEY uk_game_player (game_id, open_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    INDEX idx_side (side),
    INDEX idx_role (role),
    INDEX idx_game_players_open_id (open_id),
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
    car_index INT NOT NULL DEFAULT 1 COMMENT '本轮第几次提名（车次），1起',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
    UNIQUE KEY uk_vote_unique (game_id, open_id, vote_type, round, car_index),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_round (game_id, round, vote_type, car_index),
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
-- 7b. game_cars表：每次提名（车）的归档记录
-- =============================================
CREATE TABLE game_cars (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '回合数',
    car_index INT NOT NULL COMMENT '本轮第几次提名（车次），1起',
    team_leader_open_id VARCHAR(64) NOT NULL COMMENT '本次提名的队长',
    nominated_team JSON NOT NULL COMMENT '提名队伍',
    team_votes JSON NULL COMMENT '队伍投票快照 {openId: approve/reject}',
    outcome VARCHAR(10) NOT NULL COMMENT '结果：pending=投票中, send=发车, reject=流车',
    is_forced_car BOOLEAN DEFAULT FALSE COMMENT '本次是否为强制车（forcedCar 发车，无队伍投票）',
    mission_votes JSON NULL COMMENT '任务投票快照 {openId: success/fail}',
    mission_success BOOLEAN NULL COMMENT '任务是否成功（仅 outcome=send 有效）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    UNIQUE KEY uk_game_round_car (game_id, round, car_index),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    CHECK (outcome IN ('pending', 'send', 'reject'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每次提名归档表';

-- =============================================
-- 7c. lake_history表：湖仙验人记录
-- =============================================
CREATE TABLE lake_history (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '验人发生的回合',
    inspector_open_id VARCHAR(64) NOT NULL COMMENT '验人者（湖仙持有者）',
    target_open_id VARCHAR(64) NOT NULL COMMENT '被查验者',
    result VARCHAR(10) NOT NULL COMMENT '被查验者当前阵营：good/evil',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '验人时间',
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    CHECK (result IN ('good', 'evil'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='湖仙验人记录表';

-- =============================================
-- 7d. lancelot_swap_history表：兰斯洛特转换抽卡记录
-- =============================================
CREATE TABLE lancelot_swap_history (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '发生转换的回合',
    switched BOOLEAN NOT NULL COMMENT '是否发生阵营转换',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兰斯洛特转换抽卡记录表';

-- =============================================
-- 8. game_visions表：游戏玩家视野（开局冻结，不随兰斯洛特转换变化）
-- =============================================
CREATE TABLE game_visions (
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    open_id VARCHAR(64) NOT NULL COMMENT '玩家openId',
    vision JSON NULL COMMENT '该玩家视野 {seen:[{openId,role?,side?,canIdentity}]}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
    PRIMARY KEY (game_id, open_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏玩家视野表';

-- =============================================
-- 8b. game_identity_marks表：玩家身份标记（仅本人可见，长按卡片记录推理）
-- =============================================
CREATE TABLE game_identity_marks (
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    open_id VARCHAR(64) NOT NULL COMMENT '标记者openId',
    target_open_id VARCHAR(64) NOT NULL COMMENT '被标记玩家openId',
    side VARCHAR(10) NULL COMMENT '标记阵营 good/evil（可单独设置）',
    role VARCHAR(50) NULL COMMENT '标记角色（可单独设置）',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (game_id, open_id, target_open_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏身份标记表（仅本人可见）';

-- =============================================
-- 9. role_configurations表：角色配置模板
-- =============================================
CREATE TABLE role_configurations (
    player_count INT PRIMARY KEY COMMENT '玩家数量',
    roles JSON NOT NULL COMMENT '角色配置数组',
    team_sizes JSON NOT NULL COMMENT '队伍大小配置'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色配置表';

INSERT INTO role_configurations (player_count, roles, team_sizes) VALUES
(5, '["merlin", "percival", "loyal", "morgana", "assassin"]', '[2,3,2,3,3]'),
(6, '["merlin", "percival", "loyal", "loyal", "morgana", "assassin"]', '[2,3,4,3,4]'),
(7, '["merlin", "percival", "loyal", "loyal", "morgana", "assassin", "oberon"]', '[2,3,3,4,4]'),
(8, '["merlin", "percival", "loyal", "loyal", "loyal", "morgana", "assassin", "minion"]', '[3,4,4,5,5]'),
(9, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "mordred"]', '[3,4,4,5,5]'),
(10, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "morgana", "assassin", "mordred", "oberon"]', '[3,4,4,5,5]'),
(11, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "lancelotBlue", "morgana", "mordred", "oberon", "lancelotRed"]', '[3,4,5,6,6]'),
(12, '["merlin", "percival", "loyal", "loyal", "loyal", "loyal", "lancelotBlue", "morgana", "assassin", "mordred", "oberon", "lancelotRed"]', '[3,4,5,6,6]')
ON DUPLICATE KEY UPDATE roles=VALUES(roles), team_sizes=VALUES(team_sizes);

-- =============================================
-- 10. friendships表：好友关系（双向两行）
-- =============================================
CREATE TABLE friendships (
    user_open_id VARCHAR(64) NOT NULL COMMENT '用户openId',
    friend_open_id VARCHAR(64) NOT NULL COMMENT '好友openId',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '成为好友时间',
    PRIMARY KEY (user_open_id, friend_open_id),
    INDEX idx_friend (friend_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表(双向两行)';

-- =============================================
-- 11. friend_requests表：好友申请（仅存pending，同意/拒绝即删）
-- =============================================
CREATE TABLE friend_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_open_id VARCHAR(64) NOT NULL COMMENT '申请方openId',
    to_open_id VARCHAR(64) NOT NULL COMMENT '被申请方openId',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    UNIQUE KEY uniq_pending (from_open_id, to_open_id),
    INDEX idx_to (to_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友申请表(仅pending)';

-- =============================================
-- 初始化完成
-- =============================================
SELECT 'AVALON v2.0 数据库初始化完成' AS status;
