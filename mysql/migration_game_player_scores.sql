-- AVALON 计分制迁移：逐局逐人分数明细
-- 规则：基础分 + 胜负分（阵营胜率加权） + 角色分（胜方内部零和） + MVP/SVP 票分（每票 0.01）
-- 本表为物化结果，可通过 server/scripts/backfill-scores.js 全量重算（幂等）
CREATE TABLE IF NOT EXISTS game_player_scores (
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    open_id VARCHAR(64) NOT NULL COMMENT '玩家openId',
    side VARCHAR(10) NOT NULL COMMENT '阵营：good/evil',
    role VARCHAR(50) NOT NULL COMMENT '角色',
    base DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '基础分',
    win_score DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '胜负分（含正负）',
    role_score DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '角色分（仅胜方内部再分配）',
    award_score DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT 'MVP/SVP 票分',
    total DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '本局总得分（非负）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, open_id),
    KEY idx_score_open (open_id),
    KEY idx_score_game (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='计分制逐局逐人明细';
