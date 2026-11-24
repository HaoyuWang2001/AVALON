-- 一个用户最多拥有一个房间（owner_id 唯一）
-- 执行前已确认生产无重复 owner_id。
ALTER TABLE rooms DROP INDEX idx_owner_id, ADD UNIQUE KEY uk_owner (owner_id);
