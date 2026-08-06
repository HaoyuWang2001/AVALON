-- AVALON 队伍投票票型展示阶段（teamVoteReveal）迁移 2026-08-06
-- 队伍投票全投后进入 teamVoteReveal 阶段（固定 voteRevealDuration 秒），后端定时推进到下一阶段。
-- 1) games 表新增 vote_reveal_end_at（展示阶段结束时间，后端推进依据）
ALTER TABLE games
    ADD COLUMN vote_reveal_end_at DATETIME NULL COMMENT '队伍投票票型展示阶段结束时间（teamVoteReveal 阶段，后端推进）' AFTER lancelot_result;
-- 2) games 表新增 forced_car（当前车是否为强制车，强制车直接进入 missionVote）
ALTER TABLE games
    ADD COLUMN forced_car BOOLEAN DEFAULT FALSE COMMENT '当前车是否为强制车（forcedCar 发车，直接进入 missionVote）' AFTER vote_reveal_end_at;
-- 3) game_cars 表新增 is_forced_car（本次是否为强制车，history.cars.details 展示用）
ALTER TABLE game_cars
    ADD COLUMN is_forced_car BOOLEAN DEFAULT FALSE COMMENT '本次是否为强制车（forcedCar 发车，无队伍投票）' AFTER outcome;
