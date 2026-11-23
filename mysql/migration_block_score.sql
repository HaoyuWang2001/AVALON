-- AVALON 积分增加「挡刀分」
-- 蓝方胜利且刺杀未命中梅林时，被刺杀的好人获得（按人数档位，叠加在角色分之上）。
-- 注意：MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS；重复执行前请先检查列是否已存在。
ALTER TABLE game_player_scores
    ADD COLUMN block_score DECIMAL(6,2) NOT NULL DEFAULT 0.00
    COMMENT '挡刀分（蓝方胜利且刺杀未命中时给被刺好人）'
    AFTER award_score;
