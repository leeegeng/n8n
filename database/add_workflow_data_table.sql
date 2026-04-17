-- 创建工作流数据表，用于存储 n8n 工作流中的临时数据（如 calculated）
CREATE TABLE IF NOT EXISTS ticket_workflow_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    data_key VARCHAR(100) NOT NULL,
    data_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ticket_node_key (ticket_id, node_id, data_key),
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_data_key (data_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单工作流临时数据表';
