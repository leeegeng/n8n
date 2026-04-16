-- 修改 ticket_history 表，允许 action_by 为 NULL
ALTER TABLE ticket_history MODIFY COLUMN action_by INT COMMENT '操作人ID (NULL表示系统操作)';

-- 验证修改
DESCRIBE ticket_history;
