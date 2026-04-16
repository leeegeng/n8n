-- 通知表（用于首页消息提示）
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '接收用户ID',
    type VARCHAR(50) NOT NULL COMMENT '类型: task-审批任务, status-状态变更, error-错误',
    message VARCHAR(500) NOT NULL COMMENT '通知内容',
    ticket_id INT COMMENT '关联工单ID',
    extra_data JSON COMMENT '额外数据',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读: 0-未读, 1-已读',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL COMMENT '阅读时间',
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表';

-- 修改 ticket_tasks 表，添加 n8n_execution_id 字段
ALTER TABLE ticket_tasks ADD COLUMN n8n_execution_id VARCHAR(100) COMMENT 'n8n执行ID';

-- 修改 workflow_definitions 表，添加 n8n 配置
ALTER TABLE workflow_definitions
ADD COLUMN n8n_config JSON COMMENT 'n8n配置: {webhookUrl, n8nWorkflowId}';
