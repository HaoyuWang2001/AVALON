-- AVALON 公开胜率迁移
-- users 新增 public_winrate：控制是否对其他玩家公开胜率（1=公开，0=私密）。默认公开。
ALTER TABLE users
    ADD COLUMN public_winrate TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否公开胜率(1=公开,0=私密)' AFTER avatar_url;
