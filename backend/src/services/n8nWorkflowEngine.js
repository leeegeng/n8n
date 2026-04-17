/**
 * n8n 原生流程引擎 - 模式二（纯n8n控制）
 * 所有流程逻辑由 n8n 控制，本地系统只负责：
 * 1. 数据存储
 * 2. 首页通知展示
 * 3. 用户审批操作
 */

const db = require('../config/database');
const { generateTicketNo } = require('../utils/ticketNo');
const axios = require('axios');
const EventEmitter = require('events');

// 全局事件发射器，用于通知前端
class NotificationEmitter extends EventEmitter {}
const notificationEmitter = new NotificationEmitter();

class N8nWorkflowEngine {
    constructor() {
        this.pendingCallbacks = new Map(); // 存储等待n8n的回调
    }

    /**
     * 创建工单并触发 n8n 工作流
     */
    async createTicket(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { workflowId, title, description, formData, priority = 2, createdBy } = data;

            // 获取流程定义
            const workflow = await db.getOne(
                'SELECT * FROM workflow_definitions WHERE id = ? AND status = 1',
                [workflowId]
            );

            if (!workflow) {
                throw new Error('流程不存在或未发布');
            }

            // 处理 n8n_config (MySQL JSON 类型已自动解析为对象)
            let n8nConfig = workflow.n8n_config || {};
            if (typeof n8nConfig === 'string') {
                try {
                    n8nConfig = JSON.parse(n8nConfig);
                } catch (e) {
                    n8nConfig = {};
                }
            }
            if (!n8nConfig.webhookUrl) {
                throw new Error('流程未配置n8n webhook地址');
            }

            // 生成工单编号
            const ticketNo = await generateTicketNo();

            // 创建工单
            const ticketResult = await conn.execute(
                `INSERT INTO tickets (ticket_no, title, description, workflow_id, current_node_id,
                                    current_node_name, form_data, priority, status, created_by)
                 VALUES (?, ?, ?, ?, 'n8n_processing', '等待n8n处理', ?, ?, 1, ?)`,
                [ticketNo, title, description, workflowId,
                 JSON.stringify(formData), priority, createdBy]
            );

            const ticketId = ticketResult[0].insertId;

            // 创建初始历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name, form_data)
                 VALUES (?, 'start', '开始', 'submit', ?, '创建人', ?)`,
                [ticketId, createdBy, JSON.stringify(formData)]
            );

            await db.commit(conn);

            // 异步触发 n8n
            this.triggerN8nWorkflow(ticketId, ticketNo, workflow, formData, createdBy).catch(console.error);

            return {
                ticketId,
                ticketNo,
                message: '工单创建成功，正在启动流程'
            };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 触发 n8n 工作流
     */
    async triggerN8nWorkflow(ticketId, ticketNo, workflow, formData, createdBy) {
        console.log('[n8nWorkflowEngine] triggerN8nWorkflow 被调用:', { ticketId, ticketNo, workflowId: workflow.id, formData });
        try {
            // 处理 n8n_config (MySQL JSON 类型已自动解析为对象)
            let n8nConfig = workflow.n8n_config || {};
            if (typeof n8nConfig === 'string') {
                try {
                    n8nConfig = JSON.parse(n8nConfig);
                } catch (e) {
                    n8nConfig = {};
                }
            }

            // 获取创建人信息
            const creator = await db.getOne(
                `SELECT u.id, u.real_name, u.email, u.department_id, d.name as department_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.id = ?`,
                [createdBy]
            );

            // 获取创建人的角色
            const roles = await db.query(
                `SELECT r.id, r.code, r.name FROM roles r
                 INNER JOIN user_roles ur ON r.id = ur.role_id
                 WHERE ur.user_id = ?`,
                [createdBy]
            );

            const payload = {
                event: 'ticket_created',
                ticket: {
                    id: ticketId,
                    ticketNo: ticketNo,
                    title: workflow.name,
                    description: workflow.description,
                    priority: workflow.priority,
                    formData: formData,
                    creator: {
                        id: creator.id,
                        name: creator.real_name,
                        email: creator.email,
                        departmentId: creator.department_id,
                        departmentName: creator.department_name,
                        roles: roles.map(r => ({ id: r.id, code: r.code, name: r.name }))
                    }
                },
                workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    code: workflow.code,
                    n8nWorkflowId: n8nConfig.n8nWorkflowId
                },
                // 回调地址
                callbackBaseUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/webhook/n8n`,
                timestamp: new Date().toISOString()
            };

            // 发送到 n8n
            console.log('[n8nWorkflowEngine] 发送请求到 n8n:', { url: n8nConfig.webhookUrl, payload: JSON.stringify(payload, null, 2) });
            const response = await axios.post(n8nConfig.webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.N8N_API_KEY || '',
                    'X-Ticket-Id': ticketId.toString()
                },
                timeout: 30000
            });

            console.log('[n8nWorkflowEngine] n8n工作流触发成功:', response.data);

            // 更新工单状态
            await db.execute(
                `UPDATE tickets SET current_node_name = 'n8n运行中', updated_at = NOW() WHERE id = ?`,
                [ticketId]
            );

        } catch (error) {
            console.error('[n8nWorkflowEngine] 触发n8n工作流失败:', error.message);
            console.error('[n8nWorkflowEngine] 错误详情:', error.response?.data || error);

            await db.execute(
                `UPDATE tickets SET current_node_name = 'n8n触发失败', status = 0, updated_at = NOW() WHERE id = ?`,
                [ticketId]
            );

            // 通知创建人
            await this.addNotification(createdBy, 'error', `工单 ${ticketNo} 流程启动失败`, ticketId);
        }
    }

    /**
     * n8n 回调：创建审批任务
     */
    async createApprovalTask(data) {
        console.log('[n8nWorkflowEngine] createApprovalTask 被调用:', JSON.stringify(data, null, 2));
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const {
                ticketId,
                nodeId,
                nodeName,
                assigneeType,
                assigneeId,
                assignees,
                taskType = 1,
                dueTime,
                n8nExecutionId,
                calculated
            } = data;

            // 保存 calculated 数据到数据库（供后续节点使用）
            if (calculated) {
                // 如果 calculated 已经是字符串，直接使用；否则序列化
                const calculatedValue = typeof calculated === 'string' ? calculated : JSON.stringify(calculated);
                await db.execute(
                    `INSERT INTO ticket_workflow_data (ticket_id, node_id, data_key, data_value, created_at)
                     VALUES (?, ?, 'calculated', ?, NOW())
                     ON DUPLICATE KEY UPDATE
                     data_value = VALUES(data_value),
                     created_at = VALUES(created_at)`,
                    [ticketId, nodeId, calculatedValue]
                );
            }

            // 获取工单创建人信息
            const ticketInfo = await db.getOne(
                'SELECT created_by FROM tickets WHERE id = ?',
                [ticketId]
            );
            const createdBy = ticketInfo ? ticketInfo.created_by : 1; // 默认使用管理员ID

            // 根据工单创建人查询部门经理（当 assigneeType 为 4 时）
            let finalAssigneeType = assigneeType;
            let finalAssigneeId = assigneeId;
            if (assigneeType === 4) {
                // 查询创建人的部门经理
                const managerResult = await db.getOne(
                    `SELECT m.id as manager_id 
                     FROM users u
                     JOIN departments d ON u.department_id = d.id
                     JOIN users m ON d.manager_id = m.id
                     WHERE u.id = ?`,
                    [createdBy]
                );
                if (managerResult && managerResult.manager_id) {
                    finalAssigneeType = 1; // 改为指定用户
                    finalAssigneeId = managerResult.manager_id;
                    console.log('[n8nWorkflowEngine] 自动分配部门经理:', { createdBy, managerId: finalAssigneeId });
                } else {
                    console.log('[n8nWorkflowEngine] 未找到部门经理，使用默认角色:', { assigneeId });
                    finalAssigneeType = 2; // 回退到角色分配
                    finalAssigneeId = assigneeId;
                }
            }

            // 更新工单当前节点
            await conn.execute(
                `UPDATE tickets SET current_node_id = ?, current_node_name = ?, updated_at = NOW() WHERE id = ?`,
                [nodeId, nodeName, ticketId]
            );

            // 记录历史 (使用工单创建人作为 action_by)
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name)
                 VALUES (?, ?, ?, 'n8n_assign', ?, 'n8n')`,
                [ticketId, nodeId, nodeName, createdBy]
            );

            let targetUsers = [];

            // 转换日期格式为 MySQL TIMESTAMP 格式
            const formatDateTime = (isoString) => {
                if (!isoString) return null;
                try {
                    const date = new Date(isoString);
                    return date.toISOString().slice(0, 19).replace('T', ' ');
                } catch (e) {
                    return null;
                }
            };
            const formattedDueTime = formatDateTime(dueTime);

            // 创建任务
            if (taskType === 2 && assignees && assignees.length > 0) {
                // 会签任务
                const taskResult = await conn.execute(
                    `INSERT INTO ticket_tasks (ticket_id, node_id, node_name, task_type, assignee_type, assignee_id, status, due_time, n8n_execution_id)
                     VALUES (?, ?, ?, 2, 0, 0, 0, ?, ?)`,
                    [ticketId, nodeId, nodeName, formattedDueTime, n8nExecutionId]
                );

                const taskId = taskResult[0].insertId;

                for (const assignee of assignees) {
                    await conn.execute(
                        `INSERT INTO ticket_countersign (task_id, ticket_id, user_id, status)
                         VALUES (?, ?, ?, 0)`,
                        [taskId, ticketId, assignee.userId]
                    );
                    targetUsers.push(assignee.userId);
                }
            } else {
                // 单人任务
                await conn.execute(
                    `INSERT INTO ticket_tasks (ticket_id, node_id, node_name, task_type, assignee_type, assignee_id, status, due_time, n8n_execution_id)
                     VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)`,
                    [ticketId, nodeId, nodeName, finalAssigneeType, finalAssigneeId, formattedDueTime, n8nExecutionId]
                );

                // 根据指派类型获取目标用户
                if (finalAssigneeType === 1) {
                    targetUsers = [finalAssigneeId];
                } else if (finalAssigneeType === 2) {
                    const users = await conn.execute(
                        `SELECT user_id FROM user_roles WHERE role_id = ?`,
                        [finalAssigneeId]
                    );
                    targetUsers = users[0].map(u => u.user_id);
                } else if (finalAssigneeType === 3) {
                    const users = await conn.execute(
                        `SELECT id FROM users WHERE department_id = ? AND status = 1`,
                        [finalAssigneeId]
                    );
                    targetUsers = users[0].map(u => u.id);
                }
            }

            // 获取工单信息
            const ticket = await db.getOne(
                `SELECT ticket_no, title FROM tickets WHERE id = ?`,
                [ticketId]
            );

            // 给目标用户添加通知
            for (const userId of targetUsers) {
                await this.addNotification(userId, 'task', `您有新的审批任务：${ticket.title}`, ticketId, {
                    nodeName,
                    taskType,
                    ticketNo: ticket.ticket_no
                });
            }

            await db.commit(conn);

            // 查询 calculated 数据
            const workflowDataResult = await db.getOne(
                `SELECT data_value FROM ticket_workflow_data 
                 WHERE ticket_id = ? AND data_key = 'calculated'
                 ORDER BY created_at DESC LIMIT 1`,
                [ticketId]
            );
            let calculatedData = workflowDataResult ? JSON.parse(workflowDataResult.data_value) : null;
            // 兼容性处理：如果解析后还是字符串（双重序列化），再解析一次
            if (typeof calculatedData === 'string') {
                calculatedData = JSON.parse(calculatedData);
            }
            // 确保 calculated 中包含 ticketId
            if (calculatedData && !calculatedData.ticketId) {
                calculatedData.ticketId = ticketId;
            }

            return { success: true, targetUsers, calculated: calculatedData };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * n8n 回调：等待审批完成
     */
    async waitForApproval(data) {
        console.log('[n8nWorkflowEngine] waitForApproval 被调用:', JSON.stringify(data, null, 2));
        const { ticketId, nodeId, timeout = 86400 } = data;

        return new Promise((resolve, reject) => {
            const callbackKey = `${ticketId}_${nodeId}`;

            const timeoutId = setTimeout(() => {
                this.pendingCallbacks.delete(callbackKey);
                reject(new Error('等待审批超时'));
            }, timeout * 1000);

            this.pendingCallbacks.set(callbackKey, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    this.pendingCallbacks.delete(callbackKey);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    this.pendingCallbacks.delete(callbackKey);
                    reject(error);
                }
            });
        });
    }

    /**
     * 用户提交审批
     */
    async submitApproval(ticketId, data) {
        console.log('[n8nWorkflowEngine] submitApproval 被调用:', { ticketId, data: JSON.stringify(data, null, 2) });
        const { nodeId, action, comment, userId, userName } = data;

        const conn = await db.getConnection();
        let n8nExecutionId = null;
        try {
            await db.beginTransaction(conn);

            // 获取任务的 n8n_execution_id（不限制状态，因为可能已经被处理过）
            const taskResult = await conn.execute(
                `SELECT n8n_execution_id, status FROM ticket_tasks 
                 WHERE ticket_id = ? AND node_id = ?
                 ORDER BY id DESC LIMIT 1`,
                [ticketId, nodeId]
            );
            if (taskResult[0] && taskResult[0].length > 0) {
                n8nExecutionId = taskResult[0][0].n8n_execution_id;
                const taskStatus = taskResult[0][0].status;
                console.log('[n8nWorkflowEngine] 获取到任务信息:', { n8nExecutionId, taskStatus });
            } else {
                console.log('[n8nWorkflowEngine] 未找到任务记录');
            }

            // 更新任务（只更新待处理状态的任务）
            const updateResult = await conn.execute(
                `UPDATE ticket_tasks
                 SET status = 1, result = ?, comment = ?, processed_at = NOW(), processed_by = ?
                 WHERE ticket_id = ? AND node_id = ? AND status = 0`,
                [action === 'approve' ? 1 : 2, comment, userId, ticketId, nodeId]
            );
            console.log('[n8nWorkflowEngine] 任务更新结果:', { affectedRows: updateResult[0].affectedRows });

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name, comment)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ticketId, nodeId, nodeId, action, userId, userName, comment]
            );

            await db.commit(conn);

            // 将审批结果保存到数据库，供 n8n Webhook 节点查询（服务重启后可恢复）
            await db.execute(
                `INSERT INTO approval_results (ticket_id, node_id, action, comment, user_id, user_name, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                 action = VALUES(action),
                 comment = VALUES(comment),
                 user_id = VALUES(user_id),
                 user_name = VALUES(user_name),
                 created_at = VALUES(created_at)`,
                [ticketId, nodeId, action, comment, userId, userName]
            );

            // 尝试唤醒内存中的等待（兼容旧模式，如果服务未重启）
            const callbackKey = `${ticketId}_${nodeId}`;
            const callback = this.pendingCallbacks.get(callbackKey);

            if (callback) {
                callback.resolve({
                    action,
                    comment,
                    userId,
                    userName,
                    timestamp: new Date().toISOString()
                });
            }

            // 查询 calculated 数据（从第一个任务节点获取）
            const workflowDataResult = await db.getOne(
                `SELECT data_value FROM ticket_workflow_data 
                 WHERE ticket_id = ? AND data_key = 'calculated'
                 ORDER BY created_at DESC LIMIT 1`,
                [ticketId]
            );
            let calculatedData = workflowDataResult ? JSON.parse(workflowDataResult.data_value) : null;
            // 兼容性处理：如果解析后还是字符串（双重序列化），再解析一次
            if (typeof calculatedData === 'string') {
                calculatedData = JSON.parse(calculatedData);
            }
            // 确保 calculated 中包含 ticketId
            if (calculatedData && !calculatedData.ticketId) {
                calculatedData.ticketId = ticketId;
            }

            // 主动回调 n8n Webhook（新模式，服务重启后可恢复）
            if (n8nExecutionId) {
                console.log('[n8nWorkflowEngine] 准备回调 n8n Webhook:', { ticketId, nodeId, n8nExecutionId });
                try {
                    await this.callbackN8nWebhook(ticketId, nodeId, n8nExecutionId, {
                        action,
                        comment,
                        userId,
                        userName,
                        calculated: calculatedData
                    });
                    console.log('[n8nWorkflowEngine] n8n Webhook 回调成功');
                } catch (err) {
                    console.error('[n8nWorkflowEngine] 回调 n8n Webhook 失败:', err.message);
                    throw new Error('审批结果同步到工作流失败，请稍后重试');
                }
            } else {
                console.log('[n8nWorkflowEngine] 跳过 n8n 回调：n8nExecutionId 为空');
            }

            // 通知创建人
            const ticket = await db.getOne(
                `SELECT created_by, ticket_no, title FROM tickets WHERE id = ?`,
                [ticketId]
            );

            const actionText = action === 'approve' ? '通过' : '驳回';
            await this.addNotification(
                ticket.created_by,
                'status',
                `您的工单 ${ticket.title} 被${userName}${actionText}`,
                ticketId,
                { action, nodeId, ticketNo: ticket.ticket_no }
            );

            return { success: true, message: '审批提交成功' };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 回调 n8n Webhook 节点
     * @param {number} ticketId - 工单ID
     * @param {string} nodeId - 节点ID
     * @param {string} executionId - n8n 执行ID
     * @param {object} approvalData - 审批数据
     */
    async callbackN8nWebhook(ticketId, nodeId, executionId, approvalData) {
        const n8nBaseUrl = process.env.N8N_WEBHOOK_BASE_URL || 'http://localhost:5678/webhook';
        
        // 根据 nodeId 映射到对应的 Webhook 路径
        const pathMap = {
            'manager_approval': 'approval-callback-manager',
            'ceo_approval': 'approval-callback-ceo',
            'hr_approval': 'approval-callback-hr'
        };
        
        const webhookPath = pathMap[nodeId] || `approval-callback-${nodeId}`;
        const webhookUrl = `${n8nBaseUrl}/${webhookPath}`;
        
        console.log('[n8nWorkflowEngine] 回调 n8n Webhook:', { webhookUrl, nodeId, ticketId, approvalData });
        
        try {
            const response = await axios.post(webhookUrl, {
                ...approvalData,
                ticketId,
                nodeId,
                executionId,
                timestamp: new Date().toISOString()
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            console.log('[n8nWorkflowEngine] n8n Webhook 回调成功:', response.data);
            return response.data;
        } catch (error) {
            console.error('[n8nWorkflowEngine] n8n Webhook 回调失败:', error.message);
            throw error;
        }
    }

    /**
     * n8n 回调：完成节点/流程
     */
    async completeNode(data) {
        console.log('[n8nWorkflowEngine] completeNode 被调用:', JSON.stringify(data, null, 2));
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { ticketId, nodeId, action, comment, nextNode } = data;

            // 获取工单创建人作为 action_by（避免外键约束失败）
            const ticketInfo = await db.getOne(
                'SELECT created_by FROM tickets WHERE id = ?',
                [ticketId]
            );
            const actionBy = ticketInfo ? ticketInfo.created_by : 1;

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name, comment)
                 VALUES (?, ?, ?, ?, ?, 'n8n', ?)`,
                [ticketId, nodeId || 'end', nodeId || '结束', action, actionBy, comment]
            );

            // 更新工单状态
            if (action === 'complete') {
                await conn.execute(
                    `UPDATE tickets SET status = 2, current_node_id = NULL, current_node_name = '已完成',
                                       completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
                    [ticketId]
                );
            } else if (action === 'reject') {
                if (nextNode) {
                    // 驳回到指定节点
                    await conn.execute(
                        `UPDATE tickets SET current_node_id = ?, current_node_name = ?, updated_at = NOW() WHERE id = ?`,
                        [nextNode.id, nextNode.name, ticketId]
                    );
                } else {
                    // 直接结束
                    await conn.execute(
                        `UPDATE tickets SET status = 3, current_node_id = NULL, current_node_name = '已驳回',
                                           updated_at = NOW() WHERE id = ?`,
                        [ticketId]
                    );
                }
            }

            await db.commit(conn);

            // 查询 calculated 数据
            const workflowDataResult = await db.getOne(
                `SELECT data_value FROM ticket_workflow_data 
                 WHERE ticket_id = ? AND data_key = 'calculated'
                 ORDER BY created_at DESC LIMIT 1`,
                [ticketId]
            );
            let calculatedData = workflowDataResult ? JSON.parse(workflowDataResult.data_value) : null;
            // 兼容性处理：如果解析后还是字符串（双重序列化），再解析一次
            if (typeof calculatedData === 'string') {
                calculatedData = JSON.parse(calculatedData);
            }
            // 确保 calculated 中包含 ticketId
            if (calculatedData && !calculatedData.ticketId) {
                calculatedData.ticketId = ticketId;
            }

            // 通知创建人
            const ticket = await db.getOne(
                `SELECT created_by, ticket_no, title FROM tickets WHERE id = ?`,
                [ticketId]
            );

            const statusText = action === 'complete' ? '已完成' : '已驳回';
            await this.addNotification(
                ticket.created_by,
                'status',
                `您的工单 ${ticket.title} ${statusText}`,
                ticketId,
                { action, ticketNo: ticket.ticket_no }
            );

            return { success: true, calculated: calculatedData };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 添加通知
     */
    async addNotification(userId, type, message, ticketId, extraData = {}) {
        try {
            await db.execute(
                `INSERT INTO notifications (user_id, type, message, ticket_id, extra_data, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, 0, NOW())`,
                [userId, type, message, ticketId, JSON.stringify(extraData)]
            );

            // 触发事件通知前端
            notificationEmitter.emit('new_notification', {
                userId,
                type,
                message,
                ticketId,
                extraData,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('添加通知失败:', error);
        }
    }

    /**
     * 获取用户通知
     */
    async getNotifications(userId, options = {}) {
        const { isRead, page = 1, pageSize = 20 } = options;

        let sql = `
            SELECT n.*, t.ticket_no
            FROM notifications n
            LEFT JOIN tickets t ON n.ticket_id = t.id
            WHERE n.user_id = ?
        `;
        const params = [userId];

        if (isRead !== undefined) {
            sql += ' AND n.is_read = ?';
            params.push(isRead);
        }

        sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

        return await db.query(sql, params);
    }

    /**
     * 标记通知为已读
     */
    async markNotificationRead(notificationId, userId) {
        await db.execute(
            'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
    }

    /**
     * 获取未读通知数量
     */
    async getUnreadCount(userId) {
        const result = await db.getOne(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );
        return result.count;
    }

    // 获取事件发射器
    getEventEmitter() {
        return notificationEmitter;
    }

    /**
     * 获取审批结果 - 供 n8n Webhook 节点查询
     * @param {number} ticketId - 工单ID
     * @param {string} nodeId - 节点ID
     * @returns {Promise<object|null>} 审批结果
     */
    async getApprovalResult(ticketId, nodeId) {
        const result = await db.getOne(
            `SELECT * FROM approval_results 
             WHERE ticket_id = ? AND node_id = ?
             AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [ticketId, nodeId]
        );
        
        if (!result) {
            return null;
        }
        
        return {
            action: result.action,
            comment: result.comment,
            userId: result.user_id,
            userName: result.user_name,
            timestamp: result.created_at
        };
    }

    /**
     * 删除审批结果 - 供 n8n Webhook 节点清理数据
     * @param {number} ticketId - 工单ID
     * @param {string} nodeId - 节点ID
     */
    async deleteApprovalResult(ticketId, nodeId) {
        await db.execute(
            `DELETE FROM approval_results WHERE ticket_id = ? AND node_id = ?`,
            [ticketId, nodeId]
        );
    }
}

module.exports = new N8nWorkflowEngine();
