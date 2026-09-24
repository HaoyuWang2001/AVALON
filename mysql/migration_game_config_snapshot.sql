-- AVALON 对局房间配置快照迁移
-- games 新增 room_config_snapshot：开局时写入房间配置，房间删除后历史对局仍可还原版型。
ALTER TABLE games
    ADD COLUMN room_config_snapshot JSON NULL COMMENT '开局快照房间配置（房间删除后历史对局仍可还原版型）' AFTER room_number;

-- 回填：房间仍存在的历史对局，用 rooms.room_config 补快照
UPDATE games g
JOIN rooms r ON r.id = g.room_id
SET g.room_config_snapshot = r.room_config
WHERE g.room_config_snapshot IS NULL AND r.room_config IS NOT NULL;
