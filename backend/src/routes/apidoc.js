const express = require('express');
const router = express.Router();
const path = require('path');

// API 接口定义
const apiDefinitions = {
  title: '工单系统 API 文档',
  version: '1.0.0',
  description: '工单管理系统后端接口文档 - 配合 n8n 工作流引擎',
  baseUrl: '/api',
  groups: [
    {
      name: '认证管理',
      description: '用户登录、个人信息管理',
      prefix: '/auth',
      routes: [
        { method: 'POST', path: '/login', description: '用户登录', body: ['username', 'password'] },
        { method: 'GET', path: '/profile', description: '获取当前用户信息', auth: true },
        { method: 'PUT', path: '/password', description: '修改密码', auth: true, body: ['oldPassword', 'newPassword'] }
      ]
    },
    {
      name: '部门管理',
      description: '部门组织架构管理',
      prefix: '/departments',
      routes: [
        { method: 'GET', path: '/', description: '获取部门列表（树形结构）', auth: true, query: ['status'] },
        { method: 'GET', path: '/:id', description: '获取部门详情', auth: true },
        { method: 'POST', path: '/', description: '创建部门', auth: true, body: ['name', 'code', 'parent_id', 'description', 'sort_order'] },
        { method: 'PUT', path: '/:id', description: '更新部门', auth: true, body: ['name', 'code', 'parent_id', 'description', 'sort_order', 'status'] },
        { method: 'DELETE', path: '/:id', description: '删除部门', auth: true },
        { method: 'GET', path: '/:id/users', description: '获取部门下的用户', auth: true }
      ]
    },
    {
      name: '角色管理',
      description: '角色权限管理',
      prefix: '/roles',
      routes: [
        { method: 'GET', path: '/', description: '获取角色列表', auth: true, query: ['status', 'keyword'] },
        { method: 'GET', path: '/:id', description: '获取角色详情', auth: true },
        { method: 'POST', path: '/', description: '创建角色', auth: true, body: ['name', 'code', 'description'] },
        { method: 'PUT', path: '/:id', description: '更新角色', auth: true, body: ['name', 'code', 'description', 'status'] },
        { method: 'DELETE', path: '/:id', description: '删除角色', auth: true },
        { method: 'GET', path: '/:id/users', description: '获取角色下的用户', auth: true },
        { method: 'POST', path: '/:id/users', description: '为角色分配用户', auth: true, body: ['userIds'] }
      ]
    },
    {
      name: '用户管理',
      description: '系统用户管理',
      prefix: '/users',
      routes: [
        { method: 'GET', path: '/', description: '获取用户列表', auth: true, query: ['status', 'departmentId', 'keyword', 'page', 'pageSize'] },
        { method: 'GET', path: '/select/list', description: '获取用户选择列表（用于指派）', auth: true, query: ['departmentId', 'roleId'] },
        { method: 'GET', path: '/:id', description: '获取用户详情', auth: true },
        { method: 'POST', path: '/', description: '创建用户', auth: true, body: ['username', 'password', 'realName', 'email', 'phone', 'departmentId', 'roleIds'] },
        { method: 'PUT', path: '/:id', description: '更新用户', auth: true, body: ['realName', 'email', 'phone', 'departmentId', 'status', 'roleIds'] },
        { method: 'PUT', path: '/:id/reset-password', description: '重置密码', auth: true, body: ['newPassword'] },
        { method: 'DELETE', path: '/:id', description: '删除用户', auth: true }
      ]
    },
    {
      name: '流程管理',
      description: '工作流定义管理',
      prefix: '/workflows',
      routes: [
        { method: 'GET', path: '/', description: '获取流程列表', auth: true, query: ['status', 'keyword'] },
        { method: 'GET', path: '/:id', description: '获取流程详情', auth: true },
        { method: 'POST', path: '/', description: '创建流程', auth: true, body: ['name', 'code', 'description', 'definition', 'formSchema'] },
        { method: 'PUT', path: '/:id', description: '更新流程', auth: true, body: ['name', 'code', 'description', 'definition', 'formSchema', 'status'] },
        { method: 'DELETE', path: '/:id', description: '删除流程', auth: true },
        { method: 'POST', path: '/:id/publish', description: '发布流程', auth: true },
        { method: 'POST', path: '/:id/clone', description: '复制流程（创建新版本）', auth: true, body: ['name'] }
      ]
    },
    {
      name: '工单管理',
      description: '工单生命周期管理',
      prefix: '/tickets',
      routes: [
        { method: 'GET', path: '/', description: '获取工单列表', auth: true, query: ['status', 'workflowId', 'priority', 'keyword', 'createdBy', 'page', 'pageSize'] },
        { method: 'GET', path: '/my/created', description: '获取我创建的工单', auth: true, query: ['status', 'page', 'pageSize'] },
        { method: 'GET', path: '/tasks/todo', description: '获取我的待办任务', auth: true },
        { method: 'GET', path: '/:id', description: '获取工单详情', auth: true },
        { method: 'POST', path: '/', description: '创建工单', auth: true, body: ['workflowId', 'title', 'description', 'formData', 'priority'] },
        { method: 'POST', path: '/:id/approve', description: '提交审批（通过/驳回）', auth: true, body: ['nodeId', 'action', 'comment'] },
        { method: 'POST', path: '/:id/countersign', description: '提交会签', auth: true, body: ['countersignId', 'action', 'comment'] },
        { method: 'POST', path: '/:id/transfer', description: '转派任务', auth: true, body: ['taskId', 'newAssigneeType', 'newAssigneeId', 'comment'] },
        { method: 'POST', path: '/:id/cancel', description: '取消工单', auth: true, body: ['comment'] }
      ]
    },
    {
      name: '通知管理',
      description: '消息通知管理',
      prefix: '/notifications',
      routes: [
        { method: 'GET', path: '/', description: '获取用户通知列表', auth: true, query: ['isRead', 'page', 'pageSize'] },
        { method: 'GET', path: '/unread-count', description: '获取未读通知数量', auth: true },
        { method: 'PUT', path: '/:id/read', description: '标记通知为已读', auth: true },
        { method: 'PUT', path: '/read-all', description: '标记所有通知为已读', auth: true }
      ]
    },
    {
      name: 'n8n Webhook',
      description: 'n8n 工作流回调接口（供 n8n 调用）',
      prefix: '/webhook/n8n',
      routes: [
        { method: 'POST', path: '/create-task', description: '创建审批任务', body: ['ticketId', 'nodeId', 'nodeName', 'assigneeType', 'assigneeId', 'taskType', 'assignees', 'n8nExecutionId', 'dueTime'] },
        { method: 'POST', path: '/wait-approval', description: '等待审批（长轮询）', body: ['ticketId', 'nodeId', 'timeout'] },
        { method: 'POST', path: '/complete-node', description: '完成节点/流程', body: ['ticketId', 'nodeId', 'action', 'comment', 'nextNode'] },
        { method: 'POST', path: '/ticket-status', description: '更新工单状态（兼容）', body: ['ticketId', 'status', 'comment', 'nodeData'] },
        { method: 'POST', path: '/proceed', description: '推进到下一节点', body: ['ticketId', 'nextNodeId', 'comment', 'formData'] },
        { method: 'POST', path: '/create-sub-ticket', description: '创建子工单', body: ['parentTicketId', 'workflowId', 'title', 'description', 'formData', 'priority'] },
        { method: 'POST', path: '/notify', description: '发送通知', body: ['ticketId', 'notifyType', 'recipients', 'message', 'channel'] },
        { method: 'GET', path: '/logs', description: '获取 webhook 调用日志', query: ['ticketId', 'page', 'pageSize'] }
      ]
    }
  ]
};

// HTML 文档页面
const getHtmlPage = () => {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${apiDefinitions.title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f5f7fa;
            color: #333;
            line-height: 1.6;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .info-card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        }
        .info-card h2 {
            color: #667eea;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .info-item {
            display: flex;
            margin: 10px 0;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .info-label {
            font-weight: 600;
            color: #666;
            width: 120px;
            flex-shrink: 0;
        }
        .info-value {
            color: #333;
            font-family: 'Consolas', monospace;
        }
        .api-group {
            background: white;
            border-radius: 12px;
            margin-bottom: 25px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .group-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 25px;
        }
        .group-header h3 {
            font-size: 1.4em;
            margin-bottom: 5px;
        }
        .group-header p {
            opacity: 0.9;
            font-size: 0.95em;
        }
        .route-list {
            padding: 0;
        }
        .route-item {
            border-bottom: 1px solid #eee;
            padding: 20px 25px;
            transition: background 0.2s;
        }
        .route-item:hover {
            background: #f8f9fa;
        }
        .route-item:last-child {
            border-bottom: none;
        }
        .route-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        .method {
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 0.85em;
            font-weight: 600;
            font-family: 'Consolas', monospace;
            text-transform: uppercase;
        }
        .method.get { background: #61affe; color: white; }
        .method.post { background: #49cc90; color: white; }
        .method.put { background: #fca130; color: white; }
        .method.delete { background: #f93e3e; color: white; }
        .path {
            font-family: 'Consolas', monospace;
            font-size: 1.1em;
            color: #333;
            font-weight: 500;
        }
        .auth-badge {
            background: #e3f2fd;
            color: #1976d2;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 500;
        }
        .route-desc {
            color: #666;
            margin-left: 0;
            margin-top: 8px;
        }
        .params {
            margin-top: 12px;
            padding: 12px;
            background: #f5f7fa;
            border-radius: 8px;
            font-size: 0.9em;
        }
        .params-title {
            font-weight: 600;
            color: #555;
            margin-bottom: 8px;
            font-size: 0.85em;
            text-transform: uppercase;
        }
        .param-tag {
            display: inline-block;
            background: #e8eaf6;
            color: #3f51b5;
            padding: 3px 10px;
            border-radius: 4px;
            margin: 3px;
            font-family: 'Consolas', monospace;
            font-size: 0.85em;
        }
        .footer {
            text-align: center;
            padding: 40px 20px;
            color: #999;
        }
        @media (max-width: 768px) {
            .header h1 { font-size: 1.8em; }
            .route-header { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 ${apiDefinitions.title}</h1>
        <p>${apiDefinitions.description}</p>
    </div>
    
    <div class="container">
        <div class="info-card">
            <h2>📋 基本信息</h2>
            <div class="info-item">
                <span class="info-label">版本:</span>
                <span class="info-value">${apiDefinitions.version}</span>
            </div>
            <div class="info-item">
                <span class="info-label">基础路径:</span>
                <span class="info-value">${apiDefinitions.baseUrl}</span>
            </div>
            <div class="info-item">
                <span class="info-label">响应格式:</span>
                <span class="info-value">JSON (code, success, message, data, timestamp)</span>
            </div>
        </div>

        ${apiDefinitions.groups.map(group => `
        <div class="api-group">
            <div class="group-header">
                <h3>${group.name}</h3>
                <p>${group.description}</p>
            </div>
            <div class="route-list">
                ${group.routes.map(route => `
                <div class="route-item">
                    <div class="route-header">
                        <span class="method ${route.method.toLowerCase()}">${route.method}</span>
                        <span class="path">${apiDefinitions.baseUrl}${group.prefix}${route.path}</span>
                        ${route.auth ? '<span class="auth-badge">🔒 需要认证</span>' : ''}
                    </div>
                    <div class="route-desc">${route.description}</div>
                    ${route.query ? `
                    <div class="params">
                        <div class="params-title">Query 参数</div>
                        ${route.query.map(p => `<span class="param-tag">${p}</span>`).join('')}
                    </div>
                    ` : ''}
                    ${route.body ? `
                    <div class="params">
                        <div class="params-title">Body 参数</div>
                        ${route.body.map(p => `<span class="param-tag">${p}</span>`).join('')}
                    </div>
                    ` : ''}
                </div>
                `).join('')}
            </div>
        </div>
        `).join('')}
    </div>

    <div class="footer">
        <p>工单管理系统 API 文档 | 配合 n8n 工作流引擎使用</p>
    </div>
</body>
</html>`;
};

// API JSON 数据
router.get('/json', (req, res) => {
  res.json(apiDefinitions);
});

// HTML 文档页面
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getHtmlPage());
});

module.exports = router;
