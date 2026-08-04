-- AVALON 历史对局快照迁移 2026-08-04
-- 1) game_players 表新增游戏开始时的玩家快照（昵称/头像/座位号），
--    使历史对局查询不再依赖 room_players（房间删除后仍可完整展示）。
ALTER TABLE game_players
    ADD COLUMN nick_name VARCHAR(64) NULL COMMENT '游戏开始时快照昵称' AFTER side,
    ADD COLUMN avatar_url VARCHAR(512) NULL COMMENT '游戏开始时快照头像' AFTER nick_name,
    ADD COLUMN seat_number INT NULL COMMENT '游戏开始时座位号' AFTER avatar_url;

-- 2) 按用户查询历史对局/胜率需要 open_id 索引
CREATE INDEX idx_game_players_open_id ON game_players(open_id);
