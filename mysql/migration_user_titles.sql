-- AVALON 玩家特殊称谓迁移
-- users.titles：字符串数组（NULL/空数组 = 无称谓），纯由开发者手工维护。
-- 示例：
--   UPDATE users SET titles = JSON_ARRAY('开朝元老','六边形战士') WHERE unique_id='xxx';
--   UPDATE users SET titles = JSON_ARRAY_APPEND(COALESCE(titles, JSON_ARRAY()), '$', '新称谓') WHERE open_id='oXXX';
--   UPDATE users SET titles = NULL WHERE open_id='oXXX';
ALTER TABLE users
    ADD COLUMN titles JSON NULL COMMENT '特殊称谓数组（开发者手工维护）' AFTER avatar_url;
