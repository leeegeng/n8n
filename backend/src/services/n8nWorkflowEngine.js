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
            const response = await axios.post(n8nConfig.webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.N8N_API_KEY || '',
                    'X-Ticket-Id': ticketId.toString()
                },
                timeout: 30000
            });

            console.log('n8n工作流触发成功:', response.data);

            // 更新工单状态
            await db.execute(
                `UPDATE tickets SET current_node_name = 'n8n运行中', updated_at = NOW() WHERE id = ?`,
                [ticketId]
            );

        } catch (error) {
            console.error('触发n8n工作流失败:', error.message);

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
                n8nExecutionId
            } = data;

            // 获取工单创建人信息
            const ticketInfo = await db.getOne(
                'SELECT created_by FROM tickets WHERE id = ?',
                [ticketId]
            );
            const createdBy = ticketInfo ? ticketInfo.created_by : 1; // 默认使用管理员ID

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
                    [ticketId, nodeId, nodeName, assigneeType, assigneeId, formattedDueTime, n8nExecutionId]
                );

                // 根据指派类型获取目标用户
                if (assigneeType === 1) {
                    targetUsers = [assigneeId];
                } else if (assigneeType === 2) {
                    const users = await conn.execute(
                        `SELECT user_id FROM user_roles WHERE role_id = ?`,
                        [assigneeId]
                    );
                    targetUsers = users[0].map(u => u.user_id);
                } else if (assigneeType === 3) {
                    const users = await conn.execute(
                        `SELECT id FROM users WHERE department_id = ? AND status = 1`,
                        [assigneeId]
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

            return { success: true, targetUsers };
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
        const { nodeId, action, comment, userId, userName } = data;

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 更新任务
            await conn.execute(
                `UPDATE ticket_tasks
                 SET status = 1, result = ?, comment = ?, processed_at = NOW(), processed_by = ?
                 WHERE ticket_id = ? AND node_id = ? AND status = 0`,
                [action === 'approve' ? 1 : 2, comment, userId, ticketId, nodeId]
            );

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name, comment)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [ticketId, nodeId, nodeId, action, userId, userName, comment]
            );

            await db.commit(conn);

            // 触发等待的回调
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

            return { success: true };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * n8n 回调：完成节点/流程
     */
    async completeNode(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { ticketId, nodeId, action, comment, nextNode } = data;

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by, action_by_name, comment)
                 VALUES (?, ?, ?, ?, 0, 'n8n', ?)`,
                [ticketId, nodeId || 'end', nodeId || '结束', action, comment]
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

            return { success: true };
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
}

module.exports = new N8nWorkflowEngine();
