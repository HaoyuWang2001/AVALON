-- AVALON MVP/SVP 选择迁移
-- 每局每位玩家对 MVP（胜利方最佳）/SVP（失败方最佳）各一次选择：
--   voted    = 已投给 target_open_id
--   declined = NoNoNo（永久放弃该奖项选择，不可重选）
--   暂时跳过 = 不写记录（下次进入结束页重新弹出）
-- 获得数 = 收到的 voted 票数累计（读时聚合，无反范式列）。
CREATE TABLE IF NOT EXISTS game_award_votes (
    game_id VARCHAR(36) NOT NULL COMMENT 'FK→games.id',
    voter_open_id VARCHAR(64) NOT NULL COMMENT '投票玩家openId',
    award VARCHAR(10) NOT NULL COMMENT '奖项：mvp(胜方最佳)/svp(败方最佳)',
    state VARCHAR(10) NOT NULL COMMENT 'voted/declined',
    target_open_id VARCHAR(64) NULL COMMENT '获选玩家（voted 时有值）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, voter_open_id, award),
    KEY idx_award_votes_target (target_open_id, award)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='MVP/SVP选择记录';
