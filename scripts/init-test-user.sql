-- 创建测试数据库用户（一次性执行）
-- 用法: mysql -u root -p < scripts/init-test-user.sql

CREATE USER IF NOT EXISTS 'avalon_test_user'@'%' IDENTIFIED BY 'avalon_test_pass_2024';
FLUSH PRIVILEGES;
