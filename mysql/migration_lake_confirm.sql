-- AVALON 湖仙确认阶段迁移 2026-08-06
-- 湖仙验人拆分为两阶段：lake（查验）→ lakeConfirm（全员确认），镜像兰斯洛特确认
-- game_players 表新增 lake_confirmed（湖仙查验全员确认，与 lancelot_confirmed 分离）
ALTER TABLE game_players
    ADD COLUMN lake_confirmed BOOLEAN DEFAULT FALSE COMMENT '湖仙查验是否已确认（全员确认后进入下一阶段）' AFTER lancelot_confirmed;
