-- 审批结果表（用于 n8n Webhook 节点查询，服务重启后可恢复）
CREATE TABLE IF NOT EXISTS approval_results (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL COMMENT '工单ID',
    node_id VARCHAR(100) NOT NULL COMMENT '节点ID',
    action VARCHAR(20) NOT NULL COMMENT '审批操作: approve-通过 reject-驳回',
    comment TEXT COMMENT '审批意见',
    user_id INT NOT NULL COMMENT '审批人ID',
    user_name VARCHAR(100) COMMENT '审批人姓名',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ticket_node (ticket_id, node_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批结果记录表（供n8n Webhook节点查询）';
