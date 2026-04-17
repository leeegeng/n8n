-- 清空测试工单数据脚本
-- 注意：此脚本会删除所有工单及相关数据，请谨慎使用！
-- 建议先备份数据库：mysqldump -u root -p ticket_system > backup.sql

-- 关闭外键检查，避免删除顺序问题
SET FOREIGN_KEY_CHECKS = 0;

-- 按依赖顺序删除数据
-- 1. 删除工单历史记录
DELETE FROM ticket_history;

-- 2. 删除会签记录
DELETE FROM ticket_countersign;

-- 3. 删除工单任务
DELETE FROM ticket_tasks;

-- 4. 删除工单
DELETE FROM tickets;

-- 5. 删除相关通知（可选，如果通知与工单关联）
-- DELETE FROM notifications WHERE ticket_id IS NOT NULL;

-- 6. 删除 webhook 日志（可选）
-- DELETE FROM webhook_logs;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 重置自增ID（可选）
-- ALTER TABLE ticket_history AUTO_INCREMENT = 1;
-- ALTER TABLE ticket_countersign AUTO_INCREMENT = 1;
-- ALTER TABLE ticket_tasks AUTO_INCREMENT = 1;
-- ALTER TABLE tickets AUTO_INCREMENT = 1;

SELECT '测试工单数据已清空' AS message;
