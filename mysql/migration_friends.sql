-- AVALON 好友系统迁移 2026-08-23
-- 1) users 表新增：unique_id（用户自选唯一ID，1-16位 中文/英文/数字/-/_）、unique_id_updated_at（每日一次修改）、last_seen_at（在线判定）
ALTER TABLE users
    ADD COLUMN unique_id VARCHAR(32) NULL COMMENT '用户自选唯一ID(1-16位,中文/英文/数字/-/_)' AFTER custom_nick_name,
    ADD COLUMN unique_id_updated_at DATETIME NULL COMMENT 'unique_id最近设置/修改时间(每日一次)' AFTER unique_id,
    ADD COLUMN last_seen_at DATETIME NULL COMMENT '最近活跃时间(混合判定在线用)' AFTER unique_id_updated_at;
ALTER TABLE users ADD UNIQUE KEY uniq_unique_id (unique_id);

-- 2) friendships 表：双向好友关系（两行：A->B 与 B->A），主键即索引
CREATE TABLE IF NOT EXISTS friendships (
    user_open_id VARCHAR(64) NOT NULL COMMENT '用户openId',
    friend_open_id VARCHAR(64) NOT NULL COMMENT '好友openId',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '成为好友时间',
    PRIMARY KEY (user_open_id, friend_open_id),
    INDEX idx_friend (friend_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友关系表(双向两行)';

-- 3) friend_requests 表：好友申请（仅存 pending，同意/拒绝即删）
CREATE TABLE IF NOT EXISTS friend_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_open_id VARCHAR(64) NOT NULL COMMENT '申请方openId',
    to_open_id VARCHAR(64) NOT NULL COMMENT '被申请方openId',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    UNIQUE KEY uniq_pending (from_open_id, to_open_id),
    INDEX idx_to (to_open_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='好友申请表(仅pending)';
