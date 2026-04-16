# n8n 工作流示例

本目录包含配合工单系统使用的 n8n 工作流示例。

## 工作流说明

### 1. 请假审批流程 (请假审批流程.json)

**适用场景**: 员工请假申请

**流程节点**:
1. **开始** - 员工提交请假申请
2. **部门经理审批** - 部门经理审批（单人审批）
3. **判断请假天数** - 条件分支
   - 请假天数 > 3天 → 人事审批
   - 请假天数 ≤ 3天 → 直接发送通知
4. **人事审批** - 人事部门审批（单人审批）
5. **发送通知** - 调用 n8n webhook 发送通知
6. **结束** - 流程结束

**配置要点**:
- 部门经理审批节点：`assigneeType: 2` (角色), `assigneeId: 2` (manager角色)
- 人事审批节点：`assigneeType: 1` (用户), `assigneeId: 1` (admin用户)
- Webhook节点：配置 n8n webhook URL 用于发送邮件/企业微信通知

### 2. 采购申请流程 (采购申请流程.json)

**适用场景**: 公司采购申请

**流程节点**:
1. **开始** - 提交采购申请
2. **部门经理审批** - 部门经理审批
3. **金额判断** - 条件分支
   - 金额 ≥ 10000 → 高管会签
   - 金额 < 10000 → 财务审批
4. **高管会签** - 多人审批（总经理 + 财务经理）
5. **财务审批** - 财务部门审批
6. **通知供应商** - 调用 webhook 通知供应商
7. **结束** - 流程结束

**配置要点**:
- 高管会签节点：`taskType: 2` (会签), 配置多个审批人
- 金额判断：根据表单中的 amount 字段进行分支

## n8n Webhook 配置

### 1. 在 n8n 中创建 Webhook

1. 登录 n8n 控制台
2. 创建新的 Workflow
3. 添加 Webhook 节点作为触发器
4. 配置 Webhook URL: `http://localhost:5678/webhook/leave-notification`
5. 选择 HTTP POST 方法

### 2. Webhook 接收的数据格式

```json
{
  "event": "node_enter",
  "ticket": {
    "id": 1,
    "ticketNo": "TK202401010001",
    "title": "请假申请",
    "description": "因病请假",
    "status": 1,
    "priority": 2,
    "currentNode": "部门经理审批",
    "formData": {
      "leaveType": "病假",
      "startDate": "2024-01-10",
      "endDate": "2024-01-12",
      "days": 3
    },
    "createdBy": "张三",
    "createdAt": "2024-01-01T10:00:00Z"
  },
  "node": {
    "id": "manager_approval",
    "name": "部门经理审批",
    "type": "task"
  },
  "triggeredBy": 1,
  "timestamp": "2024-01-01T10:05:00Z"
}
```

### 3. 示例：发送企业微信通知

在 n8n 中添加 HTTP Request 节点：

```javascript
// 节点配置
{
  "method": "POST",
  "url": "https://qyapi.weixin.qq.com/cgi-bin/message/send",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpQueryAuth",
  "sendBody": true,
  "contentType": "json",
  "body": {
    "touser": "{{ $json.ticket.createdBy }}",
    "msgtype": "text",
    "agentid": 1000002,
    "text": {
      "content": "您的工单 {{ $json.ticket.ticketNo }} 已进入 {{ $json.node.name }} 节点，请留意审批进度。"
    }
  }
}
```

### 4. 示例：发送邮件通知

```javascript
// 使用 n8n 的 Send Email 节点
{
  "to": "{{ $json.ticket.createdBy }}@company.com",
  "subject": "工单状态更新 - {{ $json.ticket.ticketNo }}",
  "text": "您的工单 {{ $json.ticket.title }} 已进入 {{ $json.node.name }} 节点。",
  "html": "<p>工单详情：</p><ul><li>编号：{{ $json.ticket.ticketNo }}</li><li>标题：{{ $json.ticket.title }}</li><li>当前节点：{{ $json.node.name }}</li></ul>"
}
```

## 系统集成说明

### 工单系统 → n8n

当工单流转到配置了 webhook 的节点时，系统会自动发送 POST 请求到指定的 n8n webhook URL。

### n8n → 工单系统

n8n 可以通过以下 API 回调工单系统：

1. **更新工单状态**
   ```
   POST http://localhost:3000/api/webhook/n8n/ticket-status
   Headers: X-API-Key: your-api-key
   Body: { "ticketId": 1, "status": 2, "comment": "自动完成" }
   ```

2. **推进到下一节点**
   ```
   POST http://localhost:3000/api/webhook/n8n/proceed
   Headers: X-API-Key: your-api-key
   Body: { "ticketId": 1, "nextNodeId": "end" }
   ```

3. **创建子工单**
   ```
   POST http://localhost:3000/api/webhook/n8n/create-sub-ticket
   Headers: X-API-Key: your-api-key
   Body: {
     "parentTicketId": 1,
     "workflowId": 2,
     "title": "子工单标题",
     "description": "子工单描述"
   }
   ```

## 环境变量配置

在工单系统的 `.env` 文件中配置：

```env
# n8n配置
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key_here
```

## 导入工作流到 n8n

1. 在 n8n 控制台点击 "Add Workflow"
2. 点击右上角菜单 → Import from File
3. 选择本目录下的 JSON 文件
4. 根据需要修改节点配置（如 webhook URL、审批人等）
5. 保存并激活工作流
