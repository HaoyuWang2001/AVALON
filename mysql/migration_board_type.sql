-- AVALON 板型体系迁移（阶段一）
-- 1) games 新增 board_type：标准板(standard)/无派板(noPercival)/专家板(expert)/自定义板(custom)
--    开局时由服务端分类器写入；历史对局由 server/scripts/backfill_board_type.js 一次性回填。
-- 2) games 新增 source：online=线上正式对局 / offline=线下补录对局（阶段二启用）。
-- 3) 线下记录草稿表（阶段二启用，提前建好避免二次迁移）：
--    offline_records 草稿本体（配置快照 + 轮次 JSON + 物化 game_id）
--    offline_record_players 座位与身份工作流（选座/审批/身份分配）

ALTER TABLE games
    ADD COLUMN board_type VARCHAR(20) NOT NULL DEFAULT 'standard' COMMENT '板型：standard/noPercival/expert/custom' AFTER room_config_snapshot,
    ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'online' COMMENT '对局来源：online/offline' AFTER board_type;

CREATE TABLE IF NOT EXISTS offline_records (
    id VARCHAR(36) NOT NULL COMMENT '记录ID（UUID）',
    owner_open_id VARCHAR(64) NOT NULL COMMENT '房主（记录创建者）openId',
    room_config JSON NOT NULL COMMENT '板子配置快照（与房间 roomConfig 同构）',
    board_type VARCHAR(20) NOT NULL COMMENT '板型：standard/noPercival/expert/custom',
    status VARCHAR(20) NOT NULL DEFAULT 'recording' COMMENT 'recording=记录中 / completed=已完成',
    rounds JSON NULL COMMENT '轮次记录：车/票型/任务/湖仙/兰斯/刺杀',
    game_id VARCHAR(36) NULL COMMENT '完成后物化的 games.id（编辑时该 id 保持不变）',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_offline_records_owner (owner_open_id),
    KEY idx_offline_records_game (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线下对局记录（草稿）';

CREATE TABLE IF NOT EXISTS offline_record_players (
    record_id VARCHAR(36) NOT NULL COMMENT '记录ID',
    open_id VARCHAR(64) NOT NULL COMMENT '玩家openId',
    nick_name VARCHAR(100) NOT NULL DEFAULT '匿名玩家',
    avatar_url TEXT,
    seat_number INT NOT NULL COMMENT '座位号 1..N',
    seat_status VARCHAR(10) NOT NULL DEFAULT 'pending' COMMENT 'pending=待房主同意 / approved=已入座',
    role VARCHAR(50) NULL COMMENT '分配身份（未分配为 NULL）',
    role_source VARCHAR(10) NULL COMMENT 'self=玩家自选 / host=房主指定',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (record_id, open_id),
    UNIQUE KEY uk_offline_record_seat (record_id, seat_number),
    KEY idx_offline_record_players_open (open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线下对局记录-玩家座位与身份';

-- 历史回填不在此处：8人含莫德雷德→expert（并修正快照红方互知）等逻辑见
-- server/scripts/backfill_board_type.js（部署后人工执行一次）。
