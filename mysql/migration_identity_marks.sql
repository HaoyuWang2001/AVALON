-- AVALON 身份标记表迁移 2026-08-06
-- 玩家在游戏中对其他玩家做身份推测标记（阵营/角色），仅本人可见，长按卡片记录
CREATE TABLE IF NOT EXISTS game_identity_marks (
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
