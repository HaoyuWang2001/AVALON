-- AVALON 阶段状态机统一迁移 2026-08-03
-- 新增独立阶段：preNominate/speakingOrder/lake/lancelot
-- 1) game_players 表新增 lancelot_confirmed（兰斯抽卡全员确认，与 reveal_confirmed 分离）
ALTER TABLE game_players
    ADD COLUMN lancelot_confirmed BOOLEAN DEFAULT FALSE COMMENT '兰斯抽卡是否已确认（全员确认后进入下一轮）' AFTER reveal_confirmed;

-- 2) games 表新增 lancelot_result（兰斯抽卡结果，供 lancelot 阶段展示）
ALTER TABLE games
    ADD COLUMN lancelot_result JSON NULL COMMENT '兰斯抽卡结果 {switched, round}' AFTER discussion_set;
