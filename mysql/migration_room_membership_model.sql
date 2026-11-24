-- 房间成员模型调整：删除等待区、删除禁座功能
-- 1) 存量等待区（seat=0）全部转为观战者（seat=-1）
-- 2) 座位号仅保留 -1（观战）与 1~N（入座）
-- 3) 移除 banned_from_seating（禁止上座功能已取消）
UPDATE room_players SET seat_number = -1, is_ready = FALSE WHERE seat_number = 0;
ALTER TABLE room_players
    MODIFY seat_number INT NOT NULL COMMENT '座位号：-1=观战, 1~N=入座';
ALTER TABLE room_players DROP COLUMN banned_from_seating;
