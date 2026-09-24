-- AVALON 对局房间号快照迁移
-- games 新增 room_number：开局时写入房间号，房间删除后仍保留（不可变）。
-- 与 room_id（FK，房间删除后 ON DELETE SET NULL）不同，room_number 不随房间删除变化。
ALTER TABLE games
    ADD COLUMN room_number VARCHAR(6) NULL COMMENT '开局快照房间号（房间删除后仍保留，写入后不可变）' AFTER room_id;

-- 回填历史对局：room_id 仍在的，复制为快照
UPDATE games SET room_number = room_id WHERE room_number IS NULL AND room_id IS NOT NULL;
