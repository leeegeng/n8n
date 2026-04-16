-- 为 ticket_tasks 表添加 n8n_execution_id 字段
ALTER TABLE ticket_tasks ADD COLUMN n8n_execution_id VARCHAR(100) COMMENT 'n8n执行ID';

-- 验证修改
DESCRIBE ticket_tasks;
