-- n8n 原生流程引擎扩展表

-- n8n 执行上下文表（用于工单系统和 n8n 双向通信）
CREATE TABLE IF NOT EXISTS n8n_executions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL COMMENT '工单ID',
    node_id VARCHAR(50) COMMENT '节点ID',
    n8n_execution_id VARCHAR(100) COMMENT 'n8n执行ID',
    status VARCHAR(50) DEFAULT 'waiting' COMMENT '状态: waiting-等待中, completed-已完成, failed-失败',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='n8n执行上下文表';

-- 流程定义表扩展字段（支持n8n原生模式）
ALTER TABLE workflow_definitions
ADD COLUMN workflow_mode TINYINT DEFAULT 1 COMMENT '流程模式: 1-本地引擎, 2-n8n原生',
ADD COLUMN n8n_config JSON COMMENT 'n8n配置: {webhookUrl, workflowId, credentials等}',
ADD COLUMN n8n_workflow_id VARCHAR(100) COMMENT 'n8n工作流ID';

-- 工单表扩展字段
ALTER TABLE tickets
ADD COLUMN n8n_execution_id VARCHAR(100) COMMENT '当前n8n执行ID';

-- 创建索引
CREATE INDEX idx_n8n_executions_ticket ON n8n_executions(ticket_id);
CREATE INDEX idx_n8n_executions_execution ON n8n_executions(n8n_execution_id);
CREATE INDEX idx_tickets_n8n_execution ON tickets(n8n_execution_id);
