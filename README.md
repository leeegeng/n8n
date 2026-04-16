# 工单管理系统

一个配合 n8n 工作流引擎使用的工单管理系统，支持部门、用户、角色管理，工单派发，流程审批（含驳回、会签）等功能。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vue 3 + Element Plus)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    后端 API (Express + MySQL)                │
│  - 基础管理模块（部门、用户、角色）                           │
│  - 工单引擎模块（流程定义、工单流转、审批）                    │
│  - Webhook模块（n8n集成）                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         n8n 工作流引擎                        │
└─────────────────────────────────────────────────────────────┘
```

## 功能特性

### 1. 基础管理
- **部门管理**: 支持多级部门结构，树形展示
- **用户管理**: 用户CRUD、角色分配、密码重置
- **角色管理**: 角色定义、用户分配

### 2. 流程管理
- **流程设计器**: 可视化流程设计（开始、审批、条件、Webhook、结束节点）
- **节点配置**:
  - 指定用户审批
  - 指定角色审批
  - 指定部门审批
  - 会签（多人审批）
- **流程版本**: 支持流程版本管理

### 3. 工单管理
- **工单创建**: 选择流程、填写表单
- **工单流转**: 自动根据流程定义流转
- **审批操作**: 通过、驳回、转派
- **会签处理**: 多人审批场景
- **流转历史**: 完整的操作记录

### 4. n8n 集成
- **Webhook触发**: 节点进入时自动触发 n8n webhook
- **双向通信**: n8n 可回调系统更新状态、推进流程
- **通知集成**: 支持邮件、企业微信等通知方式

## 技术栈

### 后端
- Node.js + Express
- MySQL + mysql2
- JWT 认证
- bcryptjs 密码加密

### 前端
- Vue 3 + Composition API
- Element Plus UI组件库
- Pinia 状态管理
- Vue Router 路由管理
- Axios HTTP请求

## 快速开始

### 1. 环境要求
- Node.js >= 16
- MySQL >= 5.7
- n8n (可选，用于高级流程编排)

### 2. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd frontend
npm install
```

### 3. 数据库配置

```bash
# 1. 创建数据库
cd backend
npm run init-db

# 或使用 MySQL 命令行
mysql -u root -p < database/schema.sql
```

### 4. 配置文件

复制 `backend/.env.example` 为 `backend/.env`，并修改配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ticket_system
DB_USER=root
DB_PASSWORD=your_password

# JWT配置
JWT_SECRET=your_jwt_secret_key

# 服务器配置
PORT=3000

# n8n配置（可选）
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key
```

### 5. 启动服务

```bash
# 启动后端（端口3000）
cd backend
npm run dev

# 启动前端（端口5173）
cd frontend
npm run dev
```

### 6. 访问系统

- 前端: http://localhost:5173
- 后端API: http://localhost:3000
- 默认账号: `admin` / `admin123`

## 项目结构

```
n8n/
├── backend/                    # 后端代码
│   ├── src/
│   │   ├── app.js             # 应用入口
│   │   ├── config/
│   │   │   └── database.js    # 数据库配置
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT认证
│   │   │   └── errorHandler.js # 错误处理
│   │   ├── routes/
│   │   │   ├── auth.js        # 认证接口
│   │   │   ├── departments.js # 部门接口
│   │   │   ├── users.js       # 用户接口
│   │   │   ├── roles.js       # 角色接口
│   │   │   ├── workflows.js   # 流程接口
│   │   │   ├── tickets.js     # 工单接口
│   │   │   └── webhook.js     # Webhook接口
│   │   ├── services/
│   │   │   └── workflowEngine.js # 流程引擎
│   │   └── utils/
│   │       ├── response.js    # 响应工具
│   │       └── ticketNo.js    # 工单编号生成
│   ├── scripts/
│   │   └── init-db.js         # 数据库初始化
│   └── package.json
├── frontend/                   # 前端代码
│   ├── src/
│   │   ├── api/               # API接口
│   │   ├── components/        # 公共组件
│   │   ├── layouts/           # 布局组件
│   │   ├── router/            # 路由配置
│   │   ├── stores/            # Pinia状态
│   │   ├── views/             # 页面组件
│   │   ├── App.vue
│   │   └── main.js
│   └── package.json
├── database/
│   └── schema.sql             # 数据库脚本
├── n8n-workflows/             # n8n工作流示例
│   ├── 请假审批流程.json
│   ├── 采购申请流程.json
│   └── README.md
└── README.md
```

## API 文档

### 认证接口
- `POST /api/auth/login` - 登录
- `GET /api/auth/profile` - 获取用户信息
- `PUT /api/auth/password` - 修改密码

### 部门接口
- `GET /api/departments` - 部门列表（树形）
- `POST /api/departments` - 创建部门
- `PUT /api/departments/:id` - 更新部门
- `DELETE /api/departments/:id` - 删除部门

### 用户接口
- `GET /api/users` - 用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

### 角色接口
- `GET /api/roles` - 角色列表
- `POST /api/roles` - 创建角色
- `PUT /api/roles/:id` - 更新角色
- `DELETE /api/roles/:id` - 删除角色

### 流程接口
- `GET /api/workflows` - 流程列表
- `POST /api/workflows` - 创建流程
- `PUT /api/workflows/:id` - 更新流程
- `POST /api/workflows/:id/publish` - 发布流程

### 工单接口
- `GET /api/tickets` - 工单列表
- `POST /api/tickets` - 创建工单
- `GET /api/tickets/:id` - 工单详情
- `POST /api/tickets/:id/approve` - 审批工单
- `POST /api/tickets/:id/countersign` - 会签
- `GET /api/tickets/tasks/todo` - 待办任务

### Webhook接口（供n8n调用）
- `POST /api/webhook/n8n/ticket-status` - 更新工单状态
- `POST /api/webhook/n8n/proceed` - 推进流程
- `POST /api/webhook/n8n/create-sub-ticket` - 创建子工单

## 流程设计器使用

1. 进入「流程管理」页面
2. 点击「新增流程」创建新流程
3. 点击「设计」进入流程设计器
4. 从左侧拖拽节点到画布
5. 配置节点属性（审批人、条件等）
6. 保存并发布流程

### 节点类型
- **开始**: 流程起点
- **审批节点**: 单人或多人审批
- **条件分支**: 根据条件判断流转方向
- **Webhook**: 调用外部系统（如n8n）
- **结束**: 流程终点

## n8n 集成配置

### 1. 配置环境变量

```env
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_API_KEY=your_n8n_api_key
```

### 2. 在 n8n 中创建 Webhook

1. 创建新的 Workflow
2. 添加 Webhook 节点
3. 配置 Webhook URL
4. 保存并激活

### 3. 导入示例工作流

参考 `n8n-workflows/` 目录下的示例文件。

## 核心功能说明

### 工单流转逻辑

1. 用户创建工单，选择流程
2. 系统根据流程定义，自动创建第一个节点的审批任务
3. 审批人收到待办任务，进行审批（通过/驳回/转派）
4. 审批通过后，系统自动推进到下一节点
5. 如配置了 n8n webhook，节点进入时会触发外部流程
6. 流程到达结束节点，工单完成

### 会签（多人审批）

1. 配置节点时选择「会签」类型
2. 指定多个会签人员
3. 所有人员都审批通过后，节点才算通过
4. 任意一人驳回，则流程驳回

### 驳回处理

1. 审批人选择「驳回」
2. 可配置驳回到指定节点，或直接结束流程
3. 被驳回的工单可重新提交

## 开发计划

- [x] 基础管理功能（部门、用户、角色）
- [x] 工单流程引擎
- [x] 流程设计器
- [x] n8n Webhook集成
- [ ] 表单设计器
- [ ] 流程监控面板
- [ ] 统计报表
- [ ] 移动端适配

## 许可证

MIT
