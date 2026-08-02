-- AVALON 生产库迁移脚本 2026-08-02
-- 1) 移除聊天消息系统（游戏禁止聊天）
DROP TABLE IF EXISTS messages;

-- 2) votes 表新增 car_index（区分本轮第几次提名）
ALTER TABLE votes
    ADD COLUMN car_index INT NOT NULL DEFAULT 1 COMMENT '本轮第几次提名（车次），1起' AFTER round;

-- 重建唯一键：同轮不同车次允许重复投票
ALTER TABLE votes DROP INDEX uk_vote_unique;
ALTER TABLE votes ADD UNIQUE KEY uk_vote_unique (game_id, open_id, vote_type, round, car_index);
ALTER TABLE votes DROP INDEX idx_game_round;
ALTER TABLE votes ADD INDEX idx_game_round (game_id, round, vote_type, car_index);

-- 3) games 表新增讨论态/湖仙持久化列
ALTER TABLE games
    ADD COLUMN lake_holder_open_id VARCHAR(64) NULL COMMENT '当前湖仙持有者' AFTER failed_nominations,
    ADD COLUMN pre_nominated_team JSON NULL COMMENT '讨论期预提名队伍（一次设置不可改）' AFTER lake_holder_open_id,
    ADD COLUMN speaking_order VARCHAR(10) DEFAULT 'asc' COMMENT '发言顺序：asc/desc' AFTER pre_nominated_team,
    ADD COLUMN discussion_set BOOLEAN DEFAULT FALSE COMMENT '本轮讨论是否已设置发言配置（一次不可改）' AFTER speaking_order;

-- 4) 新增归档表
CREATE TABLE IF NOT EXISTS game_cars (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '回合数',
    car_index INT NOT NULL COMMENT '本轮第几次提名（车次），1起',
    team_leader_open_id VARCHAR(64) NOT NULL COMMENT '本次提名的队长',
    nominated_team JSON NOT NULL COMMENT '提名队伍',
    team_votes JSON NULL COMMENT '队伍投票快照 {openId: approve/reject}',
    outcome VARCHAR(10) NOT NULL COMMENT '结果：pending=投票中, send=发车, reject=流车',
    mission_votes JSON NULL COMMENT '任务投票快照 {openId: success/fail}',
    mission_success BOOLEAN NULL COMMENT '任务是否成功（仅 outcome=send 有效）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    UNIQUE KEY uk_game_round_car (game_id, round, car_index),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id),
    CHECK (outcome IN ('pending', 'send', 'reject'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每次提名归档表';

CREATE TABLE IF NOT EXISTS lake_history (
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

CREATE TABLE IF NOT EXISTS lancelot_swap_history (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    round INT NOT NULL COMMENT '发生转换的回合',
    switched BOOLEAN NOT NULL COMMENT '是否发生阵营转换',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兰斯洛特转换抽卡记录表';
