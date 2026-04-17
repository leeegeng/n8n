-- 工单系统数据库设计
-- 配合n8n工作流引擎使用

-- 部门表
CREATE TABLE IF NOT EXISTS departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '部门名称',
    code VARCHAR(50) UNIQUE COMMENT '部门编码',
    parent_id INT DEFAULT NULL COMMENT '上级部门ID',
    description TEXT COMMENT '部门描述',
    sort_order INT DEFAULT 0 COMMENT '排序',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-禁用 1-启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) UNIQUE COMMENT '角色编码',
    description TEXT COMMENT '角色描述',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-禁用 1-启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码(加密存储)',
    real_name VARCHAR(100) COMMENT '真实姓名',
    email VARCHAR(100) COMMENT '邮箱',
    phone VARCHAR(20) COMMENT '电话',
    avatar VARCHAR(255) COMMENT '头像URL',
    department_id INT COMMENT '所属部门ID',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-禁用 1-启用',
    last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 用户角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '用户ID',
    role_id INT NOT NULL COMMENT '角色ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_role (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- 流程定义表
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '流程名称',
    code VARCHAR(50) UNIQUE COMMENT '流程编码',
    description TEXT COMMENT '流程描述',
    version INT DEFAULT 1 COMMENT '版本号',
    definition_json JSON NOT NULL COMMENT '流程定义JSON(节点、连线等)',
    form_schema JSON COMMENT '表单Schema',
    n8n_config JSON COMMENT 'n8n配置(webhookUrl等)',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-草稿 1-已发布 2-已停用',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

-- 工单表
CREATE TABLE IF NOT EXISTS tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_no VARCHAR(50) NOT NULL UNIQUE COMMENT '工单编号',
    title VARCHAR(200) NOT NULL COMMENT '工单标题',
    description TEXT COMMENT '工单描述',
    workflow_id INT NOT NULL COMMENT '流程定义ID',
    current_node_id VARCHAR(50) COMMENT '当前节点ID',
    current_node_name VARCHAR(100) COMMENT '当前节点名称',
    form_data JSON COMMENT '表单数据',
    priority TINYINT DEFAULT 2 COMMENT '优先级: 1-低 2-中 3-高 4-紧急',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-已取消 1-进行中 2-已完成 3-已驳回',
    created_by INT NOT NULL COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单表';

-- 工单流转记录表
CREATE TABLE IF NOT EXISTS ticket_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL COMMENT '工单ID',
    node_id VARCHAR(50) COMMENT '节点ID',
    node_name VARCHAR(100) COMMENT '节点名称',
    action VARCHAR(50) NOT NULL COMMENT '操作: submit-提交 approve-审批 reject-驳回 transfer-转派 recall-撤回',
    action_by INT NOT NULL COMMENT '操作人ID',
    action_by_name VARCHAR(100) COMMENT '操作人姓名',
    assignee_type TINYINT COMMENT '指派类型: 1-用户 2-角色 3-部门',
    assignee_id INT COMMENT '被指派人/角色/部门ID',
    assignee_name VARCHAR(100) COMMENT '被指派人姓名',
    comment TEXT COMMENT '审批意见',
    form_data JSON COMMENT '表单数据快照',
    next_node_id VARCHAR(50) COMMENT '下一节点ID',
    next_node_name VARCHAR(100) COMMENT '下一节点名称',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (action_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单流转记录表';

-- 工单待办任务表
CREATE TABLE IF NOT EXISTS ticket_tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ticket_id INT NOT NULL COMMENT '工单ID',
    node_id VARCHAR(50) NOT NULL COMMENT '节点ID',
    node_name VARCHAR(100) COMMENT '节点名称',
    task_type TINYINT DEFAULT 1 COMMENT '任务类型: 1-审批 2-会签(多人审批)',
    assignee_type TINYINT NOT NULL COMMENT '指派类型: 1-用户 2-角色 3-部门',
    assignee_id INT NOT NULL COMMENT '被指派人/角色/部门ID',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待处理 1-已处理 2-已转派',
    result TINYINT COMMENT '处理结果: 1-通过 2-驳回',
    comment TEXT COMMENT '处理意见',
    processed_at TIMESTAMP NULL COMMENT '处理时间',
    processed_by INT COMMENT '处理人ID',
    due_time TIMESTAMP NULL COMMENT '截止时间',
    n8n_execution_id VARCHAR(100) COMMENT 'n8n执行ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单待办任务表';

-- 会签记录表（多人审批场景）
CREATE TABLE IF NOT EXISTS ticket_countersign (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL COMMENT '任务ID',
    ticket_id INT NOT NULL COMMENT '工单ID',
    user_id INT NOT NULL COMMENT '会签人ID',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待签 1-已通过 2-已驳回',
    comment TEXT COMMENT '会签意见',
    signed_at TIMESTAMP NULL COMMENT '签署时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES ticket_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签记录表';

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL COMMENT '接收用户ID',
    type VARCHAR(50) DEFAULT 'system' COMMENT '通知类型: system-系统 ticket-工单',
    title VARCHAR(200) COMMENT '通知标题',
    message TEXT NOT NULL COMMENT '通知内容',
    ticket_id INT COMMENT '关联工单ID',
    extra_data JSON COMMENT '额外数据',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读: 0-未读 1-已读',
    read_at TIMESTAMP NULL COMMENT '阅读时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表';

-- n8n webhook调用日志表
CREATE TABLE IF NOT EXISTS webhook_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    workflow_id INT COMMENT '流程ID',
    ticket_id INT COMMENT '工单ID',
    node_id VARCHAR(50) COMMENT '节点ID',
    webhook_url VARCHAR(500) NOT NULL COMMENT 'Webhook地址',
    request_method VARCHAR(10) DEFAULT 'POST' COMMENT '请求方法',
    request_headers JSON COMMENT '请求头',
    request_body JSON COMMENT '请求体',
    response_status INT COMMENT '响应状态码',
    response_body TEXT COMMENT '响应内容',
    execution_time INT COMMENT '执行时间(ms)',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-失败 1-成功',
    error_message TEXT COMMENT '错误信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id) ON DELETE SET NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Webhook调用日志表';

-- 插入初始化数据
-- 默认部门
INSERT INTO departments (name, code, description) VALUES
('总经办', 'CEO', '总经理办公室'),
('技术部', 'TECH', '技术研发部门'),
('产品部', 'PRODUCT', '产品管理部门'),
('运营部', 'OPERATION', '运营管理部门'),
('人事部', 'HR', '人力资源部门'),
('财务部', 'FINANCE', '财务管理部门');

-- 默认角色
INSERT INTO roles (name, code, description) VALUES
('系统管理员', 'admin', '系统超级管理员'),
('部门经理', 'manager', '部门负责人'),
('普通员工', 'staff', '普通员工'),
('审批专员', 'approver', '专门负责审批的人员');

-- 默认用户 (密码: admin123)
INSERT INTO users (username, password, real_name, email, department_id) VALUES
('admin', '$2b$10$YourHashedPasswordHere', '系统管理员', 'admin@company.com', 1);

-- 给用户分配管理员角色
INSERT INTO user_roles (user_id, role_id) VALUES (1, 1);

-- 创建索引
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

-- 创建索引
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_workflow_id ON tickets(workflow_id);
CREATE INDEX idx_ticket_tasks_assignee ON ticket_tasks(assignee_type, assignee_id, status);
CREATE INDEX idx_ticket_tasks_ticket_id ON ticket_tasks(ticket_id);
CREATE INDEX idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX idx_webhook_logs_ticket_id ON webhook_logs(ticket_id);
CREATE INDEX idx_approval_results_ticket ON approval_results(ticket_id, node_id);
