# n8n 原生流程引擎集成指南

## 两种模式对比

### 模式一：本地流程引擎（默认）

```
工单系统 ──► 自建流程引擎 ──► 可选调用n8n webhook
```

- 流程定义存储在本地数据库
- 流转逻辑由 `workflowEngine.js` 控制
- n8n 仅作为外部通知/自动化工具
- 适合：简单审批流，需要精细控制

### 模式二：n8n 原生流程引擎（扩展）

```
工单系统 ──► 创建工单 ──► 触发 n8n 工作流
                              │
                              ▼
                    n8n 执行完整流程编排
                              │
                              ▼
                    回调工单系统更新状态
```

- 流程定义在 n8n 中完成
- n8n 负责完整的流程流转逻辑
- 工单系统作为数据源和状态存储
- 适合：复杂流程、多系统集成、需要 n8n 强大编排能力

---

## 模式二详细说明

### 工作流程

1. **工单创建**
   - 用户在工单系统创建工单
   - 系统存储工单数据
   - 触发 n8n webhook，传递工单数据

2. **n8n 流程编排**
   - n8n 接收 webhook 数据
   - 根据业务逻辑执行流程
   - 需要审批时，回调工单系统创建审批任务
   - 等待用户审批（使用 n8n Wait 节点）
   - 接收审批结果回调，继续执行

3. **状态同步**
   - n8n 通过 API 回调更新工单状态
   - 工单系统记录完整历史

### 数据流

```
┌─────────────┐     Webhook      ┌─────────────┐
│   工单系统   │ ───────────────► │     n8n     │
│  (创建工单)  │                  │ (流程编排)   │
└─────────────┘                  └─────────────┘
       ▲                                │
       │         API 回调               │
       └────────────────────────────────┘
         (更新状态、创建任务、查询数据)
```

---

## 配置步骤

### 1. 数据库迁移

```bash
# 执行迁移脚本，添加 n8n 相关表和字段
mysql -u root -p ticket_system < database/n8n_migration.sql
```

### 2. 配置环境变量

```env
# .env
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key
APP_URL=http://localhost:3000
```

### 3. 创建 n8n 工作流

1. 在 n8n 中导入 `n8n-native-example.json`
2. 配置 Webhook 节点的认证（Header Auth）
3. 配置邮件节点（如需要）
4. 激活工作流

### 4. 工单系统配置流程

创建流程时选择模式：

```javascript
// 创建 n8n 原生流程
POST /api/workflows
{
  "name": "请假审批流程(n8n)",
  "code": "leave-n8n",
  "workflowMode": 2,  // 2 = n8n原生模式
  "n8nConfig": {
    "webhookUrl": "http://localhost:5678/webhook/ticket-webhook",
    "workflowId": "n8n-workflow-id"
  }
}
```

---

## API 接口（n8n 调用）

### 1. 创建审批任务

```http
POST /api/webhook/n8n/create-task
Headers: X-API-Key: your-api-key

{
  "ticketId": 1,
  "nodeId": "manager_approval",
  "nodeName": "部门经理审批",
  "assigneeType": 2,        // 1-用户, 2-角色, 3-部门
  "assigneeId": 2,          // 角色ID
  "taskType": 1,            // 1-单人, 2-会签
  "assignees": [            // 会签时使用
    {"userId": 1, "name": "总经理"},
    {"userId": 2, "name": "财务经理"}
  ],
  "dueTime": "2024-01-10T18:00:00Z",
  "n8nExecutionId": "n8n-exec-id"  // 用于回调
}
```

### 2. 等待审批（长轮询）

```http
POST /api/webhook/n8n/wait-approval
Headers: X-API-Key: your-api-key

{
  "ticketId": 1,
  "nodeId": "manager_approval",
  "timeout": 86400  // 超时时间（秒）
}

// 返回：当用户审批后返回结果
{
  "action": "approve",  // 或 "reject"
  "comment": "同意",
  "userId": 3,
  "userName": "张三"
}
```

### 3. 完成节点

```http
POST /api/webhook/n8n/complete-node
Headers: X-API-Key: your-api-key

{
  "ticketId": 1,
  "nodeId": "manager_approval",
  "action": "approve",      // approve, reject, complete
  "comment": "审批通过",
  "processedBy": "n8n-node-id",
  "nextNode": {             // 可选，下一节点信息
    "id": "hr_approval",
    "name": "人事审批"
  }
}
```

### 4. 查询工单详情

```http
GET /api/tickets/1
Headers: Authorization: Bearer token
```

---

## n8n 工作流示例说明

### 示例工作流节点

1. **Webhook** - 接收工单系统触发
2. **Code** - 解析和路由数据
3. **IF** - 条件判断（流程类型）
4. **HTTP Request** - 创建审批任务
5. **HTTP Request** - 等待审批（长轮询）
6. **IF** - 审批结果判断
7. **HTTP Request** - 完成节点
8. **Email Send** - 发送通知
9. **Respond to Webhook** - 响应

### 关键点

**等待审批实现**：
- 使用 HTTP Request 节点调用 `/wait-approval`
- 设置长超时时间（如 24 小时）
- n8n 会保持执行等待，直到收到响应

**回调机制**：
- 用户审批后，工单系统根据 `n8nExecutionId` 找到对应执行
- 通过 n8n 的 Webhook 响应或专门的回调接口通知 n8n

---

## 混合模式

也可以两种模式混用：

- **简单流程** → 使用本地引擎
- **复杂流程** → 使用 n8n 引擎

在创建流程时通过 `workflowMode` 字段选择：

```javascript
// 本地模式
workflowMode: 1

// n8n 原生模式
workflowMode: 2
```

---

## 优缺点对比

| 特性 | 本地引擎 | n8n 原生 |
|------|---------|----------|
| 流程复杂度 | 简单-中等 | 简单-复杂 |
| 外部集成 | 需开发 | 内置支持 |
| 可视化设计 | 基础 | 强大 |
| 学习成本 | 低 | 中等 |
| 灵活性 | 受限 | 极高 |
| 依赖 | 仅数据库 | 需 n8n 服务 |
| 调试 | 容易 | 需熟悉 n8n |

---

## 推荐场景

**使用本地引擎**：
- 简单的多级审批
- 不需要外部系统集成
- 对稳定性要求极高

**使用 n8n 引擎**：
- 需要集成邮件、IM、ERP 等外部系统
- 流程逻辑复杂，有很多条件分支
- 需要定时触发、数据转换等高级功能
- 团队已有 n8n 使用经验
