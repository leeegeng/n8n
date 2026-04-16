const db = require('../config/database');
const { generateTicketNo } = require('../utils/ticketNo');
const axios = require('axios');

/**
 * 工单流程引擎
 * 核心功能：
 * 1. 工单创建和流转
 * 2. 任务分配（指定用户/角色/部门）
 * 3. 审批处理（通过/驳回/转派）
 * 4. 会签处理（多人审批）
 * 5. n8n webhook触发
 */

class WorkflowEngine {

    /**
     * 创建工单
     */
    async createTicket(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { workflowId, title, description, formData, priority = 2, createdBy } = data;

            // 获取流程定义
            const workflow = await conn.execute(
                'SELECT * FROM workflow_definitions WHERE id = ? AND status = 1',
                [workflowId]
            );

            if (!workflow[0][0]) {
                throw new Error('流程不存在或未发布');
            }

            const workflowDef = workflow[0][0];
            const definition = JSON.parse(workflowDef.definition_json);

            // 找到开始节点后的第一个节点
            const startNode = definition.nodes.find(n => n.type === 'start');
            const firstEdge = definition.edges.find(e => e.source === startNode.id);
            const firstNode = definition.nodes.find(n => n.id === firstEdge.target);

            // 生成工单编号
            const ticketNo = await generateTicketNo();

            // 创建工单
            const ticketResult = await conn.execute(
                `INSERT INTO tickets (ticket_no, title, description, workflow_id, current_node_id,
                                    current_node_name, form_data, priority, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [ticketNo, title, description, workflowId, firstNode.id, firstNode.name,
                 JSON.stringify(formData), priority, createdBy]
            );

            const ticketId = ticketResult[0].insertId;

            // 创建初始流转记录
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, form_data, next_node_id, next_node_name)
                 VALUES (?, ?, ?, 'submit', ?, ?, ?, ?, ?)`,
                [ticketId, startNode.id, startNode.name, createdBy, '创建人',
                 JSON.stringify(formData), firstNode.id, firstNode.name]
            );

            // 处理第一个节点的任务分配
            await this.processNodeAssignment(conn, ticketId, firstNode, createdBy, definition);

            await db.commit(conn);

            return {
                ticketId,
                ticketNo,
                currentNode: firstNode
            };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 处理节点任务分配
     */
    async processNodeAssignment(conn, ticketId, node, actionBy, definition) {
        const { assigneeType, assigneeId, assignees, taskType = 1 } = node.config || {};

        // 会签节点（多人审批）
        if (taskType === 2 && assignees && assignees.length > 0) {
            // 创建主任务
            const taskResult = await conn.execute(
                `INSERT INTO ticket_tasks (ticket_id, node_id, node_name, task_type, assignee_type,
                                         assignee_id, status)
                 VALUES (?, ?, ?, 2, 0, 0, 0)`,
                [ticketId, node.id, node.name]
            );

            const taskId = taskResult[0].insertId;

            // 创建会签记录
            for (const assignee of assignees) {
                await conn.execute(
                    `INSERT INTO ticket_countersign (task_id, ticket_id, user_id, status)
                     VALUES (?, ?, ?, 0)`,
                    [taskId, ticketId, assignee.userId]
                );
            }
        }
        // 普通审批节点
        else if (assigneeType && assigneeId) {
            await conn.execute(
                `INSERT INTO ticket_tasks (ticket_id, node_id, node_name, task_type, assignee_type,
                                         assignee_id, status)
                 VALUES (?, ?, ?, 1, ?, ?, 0)`,
                [ticketId, node.id, node.name, assigneeType, assigneeId]
            );
        }

        // 触发n8n webhook（如果配置了）
        if (node.config?.webhookUrl) {
            await this.triggerWebhook(ticketId, node, 'node_enter', actionBy);
        }
    }

    /**
     * 处理审批
     */
    async processApproval(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { ticketId, taskId, action, comment, actionBy, actionByName, formData } = data;

            // 获取工单信息
            const [ticketRows] = await conn.execute(
                `SELECT t.*, w.definition_json
                 FROM tickets t
                 JOIN workflow_definitions w ON t.workflow_id = w.id
                 WHERE t.id = ?`,
                [ticketId]
            );

            if (!ticketRows[0]) {
                throw new Error('工单不存在');
            }

            const ticket = ticketRows[0];
            const definition = JSON.parse(ticket.definition_json);

            // 更新任务状态
            await conn.execute(
                `UPDATE ticket_tasks
                 SET status = 1, result = ?, comment = ?, processed_at = NOW(), processed_by = ?
                 WHERE id = ?`,
                [action === 'approve' ? 1 : 2, comment, actionBy, taskId]
            );

            // 记录流转历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment, form_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [ticketId, ticket.current_node_id, ticket.current_node_name,
                 action, actionBy, actionByName, comment, JSON.stringify(formData)]
            );

            // 处理驳回
            if (action === 'reject') {
                await this.handleRejection(conn, ticket, definition, actionBy, actionByName, comment);
            }
            // 处理通过
            else if (action === 'approve') {
                await this.handleApproval(conn, ticket, definition, actionBy, actionByName, formData);
            }

            await db.commit(conn);

            return { success: true };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 处理通过
     */
    async handleApproval(conn, ticket, definition, actionBy, actionByName, formData) {
        const currentNodeId = ticket.current_node_id;

        // 查找下一个节点
        const edge = definition.edges.find(e => e.source === currentNodeId);

        if (!edge) {
            // 没有下一个节点，流程结束
            await conn.execute(
                `UPDATE tickets SET status = 2, current_node_id = NULL, current_node_name = '已完成',
                                   completed_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [ticket.id]
            );

            // 触发流程结束webhook
            await this.triggerWebhook(ticket.id, { id: 'end', name: '结束' }, 'process_end', actionBy);
        } else {
            const nextNode = definition.nodes.find(n => n.id === edge.target);

            // 更新工单当前节点
            await conn.execute(
                `UPDATE tickets SET current_node_id = ?, current_node_name = ?, updated_at = NOW()
                 WHERE id = ?`,
                [nextNode.id, nextNode.name, ticket.id]
            );

            // 创建流转记录
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, form_data, next_node_id, next_node_name)
                 VALUES (?, ?, ?, 'approve', ?, ?, ?, ?, ?)`,
                [ticket.id, currentNodeId, ticket.current_node_name, actionBy, actionByName,
                 JSON.stringify(formData), nextNode.id, nextNode.name]
            );

            // 处理新节点的任务分配
            await this.processNodeAssignment(conn, ticket.id, nextNode, actionBy, definition);
        }
    }

    /**
     * 处理驳回
     */
    async handleRejection(conn, ticket, definition, actionBy, actionByName, comment) {
        const currentNode = definition.nodes.find(n => n.id === ticket.current_node_id);

        // 检查是否有指定的驳回节点
        const rejectEdge = definition.edges.find(e =>
            e.source === ticket.current_node_id && e.type === 'reject'
        );

        if (rejectEdge && currentNode.config?.rejectToNode) {
            // 驳回到指定节点
            const targetNode = definition.nodes.find(n => n.id === currentNode.config.rejectToNode);

            await conn.execute(
                `UPDATE tickets SET current_node_id = ?, current_node_name = ?, updated_at = NOW()
                 WHERE id = ?`,
                [targetNode.id, targetNode.name, ticket.id]
            );

            // 创建流转记录
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment, next_node_id, next_node_name)
                 VALUES (?, ?, ?, 'reject', ?, ?, ?, ?, ?)`,
                [ticket.id, ticket.current_node_id, ticket.current_node_name,
                 actionBy, actionByName, comment, targetNode.id, targetNode.name]
            );

            // 重新分配任务
            await this.processNodeAssignment(conn, ticket.id, targetNode, actionBy, definition);
        } else {
            // 默认驳回到开始节点（重新提交）
            await conn.execute(
                `UPDATE tickets SET status = 3, current_node_id = NULL, current_node_name = '已驳回',
                                   updated_at = NOW()
                 WHERE id = ?`,
                [ticket.id]
            );

            // 触发驳回webhook
            await this.triggerWebhook(ticket.id, currentNode, 'process_reject', actionBy);
        }
    }

    /**
     * 处理会签（多人审批）
     */
    async processCountersign(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { ticketId, countersignId, action, comment, actionBy } = data;

            // 更新会签记录
            await conn.execute(
                `UPDATE ticket_countersign
                 SET status = ?, comment = ?, signed_at = NOW()
                 WHERE id = ? AND user_id = ?`,
                [action === 'approve' ? 1 : 2, comment, countersignId, actionBy]
            );

            // 获取该任务的所有会签记录
            const [countersigns] = await conn.execute(
                `SELECT tc.*, tt.id as task_id
                 FROM ticket_countersign tc
                 JOIN ticket_tasks tt ON tc.task_id = tt.id
                 WHERE tc.ticket_id = ? AND tt.status = 0`,
                [ticketId]
            );

            // 检查是否所有人都已签署
            const allSigned = countersigns.every(c => c.status !== 0);
            const anyRejected = countersigns.some(c => c.status === 2);

            if (allSigned) {
                const taskId = countersigns[0].task_id;

                // 更新任务状态
                await conn.execute(
                    `UPDATE ticket_tasks
                     SET status = 1, result = ?, processed_at = NOW(), processed_by = ?
                     WHERE id = ?`,
                    [anyRejected ? 2 : 1, actionBy, taskId]
                );

                // 获取工单信息继续流转
                const [ticketRows] = await conn.execute(
                    `SELECT t.*, w.definition_json
                     FROM tickets t
                     JOIN workflow_definitions w ON t.workflow_id = w.id
                     WHERE t.id = ?`,
                    [ticketId]
                );

                const ticket = ticketRows[0];
                const definition = JSON.parse(ticket.definition_json);

                if (anyRejected) {
                    await this.handleRejection(conn, ticket, definition, actionBy, '', '会签被驳回');
                } else {
                    await this.handleApproval(conn, ticket, definition, actionBy, '', {});
                }
            }

            await db.commit(conn);
            return { success: true };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 转派任务
     */
    async transferTask(data) {
        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            const { taskId, newAssigneeType, newAssigneeId, transferBy, comment } = data;

            // 获取原任务信息
            const [tasks] = await conn.execute(
                'SELECT * FROM ticket_tasks WHERE id = ?',
                [taskId]
            );

            if (!tasks[0]) {
                throw new Error('任务不存在');
            }

            const task = tasks[0];

            // 更新原任务为转派状态
            await conn.execute(
                `UPDATE ticket_tasks
                 SET status = 2, comment = ?, processed_at = NOW(), processed_by = ?
                 WHERE id = ?`,
                [comment, transferBy, taskId]
            );

            // 创建新任务
            await conn.execute(
                `INSERT INTO ticket_tasks (ticket_id, node_id, node_name, task_type, assignee_type,
                                         assignee_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, 0)`,
                [task.ticket_id, task.node_id, task.node_name, task.task_type,
                 newAssigneeType, newAssigneeId]
            );

            // 记录转派历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment, assignee_type, assignee_id)
                 VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?)`,
                [task.ticket_id, task.node_id, task.node_name, transferBy, '', comment,
                 newAssigneeType, newAssigneeId]
            );

            await db.commit(conn);
            return { success: true };
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    }

    /**
     * 触发n8n webhook
     */
    async triggerWebhook(ticketId, node, eventType, triggeredBy) {
        try {
            const webhookUrl = node.config?.webhookUrl ||
                              process.env.N8N_WEBHOOK_BASE_URL;

            if (!webhookUrl) {
                console.log('未配置webhook地址，跳过触发');
                return;
            }

            // 获取工单完整信息
            const ticket = await db.getOne(
                `SELECT t.*, w.name as workflow_name, u.real_name as creator_name
                 FROM tickets t
                 JOIN workflow_definitions w ON t.workflow_id = w.id
                 JOIN users u ON t.created_by = u.id
                 WHERE t.id = ?`,
                [ticketId]
            );

            const payload = {
                event: eventType,
                ticket: {
                    id: ticket.id,
                    ticketNo: ticket.ticket_no,
                    title: ticket.title,
                    description: ticket.description,
                    status: ticket.status,
                    priority: ticket.priority,
                    currentNode: node.name,
                    formData: ticket.form_data,
                    createdBy: ticket.creator_name,
                    createdAt: ticket.created_at
                },
                node: {
                    id: node.id,
                    name: node.name,
                    type: node.type
                },
                triggeredBy,
                timestamp: new Date().toISOString()
            };

            // 发送webhook请求
            const startTime = Date.now();
            const response = await axios.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.N8N_API_KEY || ''
                },
                timeout: 30000
            });

            // 记录webhook日志
            await db.execute(
                `INSERT INTO webhook_logs (workflow_id, ticket_id, node_id, webhook_url,
                                         request_method, request_body, response_status,
                                         response_body, execution_time, status)
                 VALUES (?, ?, ?, ?, 'POST', ?, ?, ?, ?, 1)`,
                [ticket.workflow_id, ticketId, node.id, webhookUrl,
                 JSON.stringify(payload), response.status,
                 JSON.stringify(response.data), Date.now() - startTime]
            );

        } catch (error) {
            console.error('Webhook触发失败:', error.message);

            // 记录失败日志
            await db.execute(
                `INSERT INTO webhook_logs (workflow_id, ticket_id, node_id, webhook_url,
                                         request_method, request_body, error_message, status)
                 VALUES (?, ?, ?, ?, 'POST', ?, ?, 0)`,
                [null, ticketId, node.id, webhookUrl,
                 JSON.stringify(payload), error.message]
            );
        }
    }

    /**
     * 获取用户的待办任务
     */
    async getTodoTasks(userId) {
        // 获取用户角色和部门
        const user = await db.getOne(
            `SELECT u.department_id,
                    GROUP_CONCAT(ur.role_id) as role_ids
             FROM users u
             LEFT JOIN user_roles ur ON u.id = ur.user_id
             WHERE u.id = ?
             GROUP BY u.id`,
            [userId]
        );

        const roleIds = user.role_ids ? user.role_ids.split(',').map(Number) : [];

        // 查询待办任务
        let sql = `
            SELECT tt.*, t.ticket_no, t.title, t.description, t.priority, t.created_at,
                   t.created_by, u.real_name as creator_name,
                   w.name as workflow_name
            FROM ticket_tasks tt
            JOIN tickets t ON tt.ticket_id = t.id
            JOIN workflow_definitions w ON t.workflow_id = w.id
            JOIN users u ON t.created_by = u.id
            WHERE tt.status = 0
              AND (
                  (tt.assignee_type = 1 AND tt.assignee_id = ?)
                  OR (tt.assignee_type = 2 AND tt.assignee_id IN (?))
                  OR (tt.assignee_type = 3 AND tt.assignee_id = ?)
              )
            ORDER BY t.priority DESC, t.created_at ASC
        `;

        const tasks = await db.query(sql, [userId, roleIds.length > 0 ? roleIds : [0], user.department_id]);

        // 查询会签任务
        const countersignTasks = await db.query(
            `SELECT tc.*, tt.node_name, t.ticket_no, t.title, t.priority
             FROM ticket_countersign tc
             JOIN ticket_tasks tt ON tc.task_id = tt.id
             JOIN tickets t ON tc.ticket_id = t.id
             WHERE tc.user_id = ? AND tc.status = 0`,
            [userId]
        );

        return {
            approvalTasks: tasks,
            countersignTasks
        };
    }
}

module.exports = new WorkflowEngine();
