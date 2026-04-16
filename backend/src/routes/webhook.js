const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const n8nWorkflowEngine = require('../services/n8nWorkflowEngine');

/**
 * n8n Webhook 接口 - 模式二（纯n8n控制）
 * 所有接口供 n8n 工作流调用
 */

// API 密钥验证中间件（已禁用，开发测试环境跳过鉴权）
const validateApiKey = (req, res, next) => {
    // 开发测试环境跳过 API 密钥验证
    next();
};

/**
 * 创建审批任务
 * n8n 调用此接口创建审批任务，并通知相关用户
 */
router.post('/n8n/create-task', validateApiKey, [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('nodeId').notEmpty().withMessage('节点ID不能为空'),
    body('nodeName').notEmpty().withMessage('节点名称不能为空'),
    body('assigneeType').isIn([1, 2, 3]).withMessage('指派类型无效'),
    body('taskType').isIn([1, 2]).withMessage('任务类型无效')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const result = await n8nWorkflowEngine.createApprovalTask(req.body);
        response.success(res, result, '审批任务创建成功');
    } catch (error) {
        console.error('创建审批任务失败:', error);
        response.error(res, error.message || '创建审批任务失败');
    }
});

/**
 * 等待审批
 * n8n 调用此接口进入等待状态，直到用户提交审批
 */
router.post('/n8n/wait-approval', validateApiKey, [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('nodeId').notEmpty().withMessage('节点ID不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        // 长轮询等待用户审批
        const result = await n8nWorkflowEngine.waitForApproval(req.body);
        response.success(res, result);
    } catch (error) {
        console.error('等待审批失败:', error);
        response.error(res, error.message || '等待审批失败');
    }
});

/**
 * 完成节点/流程
 * n8n 调用此接口标记节点完成或流程结束
 */
router.post('/n8n/complete-node', validateApiKey, [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('action').isIn(['complete', 'reject']).withMessage('操作类型无效')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const result = await n8nWorkflowEngine.completeNode(req.body);
        response.success(res, result, '流程更新成功');
    } catch (error) {
        console.error('完成节点失败:', error);
        response.error(res, error.message || '完成节点失败');
    }
});

// 以下接口保留用于兼容
router.post('/n8n/ticket-status', validateApiKey, [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('status').isIn([0, 1, 2, 3]).withMessage('状态值无效')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { ticketId, status, comment, nodeData } = req.body;

        // 验证API密钥（如果配置了）
        const apiKey = req.headers['x-api-key'];
        if (process.env.N8N_API_KEY && apiKey !== process.env.N8N_API_KEY) {
            return response.unauthorized(res, '无效的API密钥');
        }

        // 更新工单状态
        await db.execute(
            `UPDATE tickets SET status = ?, updated_at = NOW()
             ${status === 2 ? ', completed_at = NOW()' : ''}
             WHERE id = ?`,
            [status, ticketId]
        );

        // 记录历史
        if (comment) {
            await db.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment, form_data)
                 VALUES (?, ?, ?, 'n8n_callback', 0, 'n8n', ?, ?)`,
                [ticketId, nodeData?.nodeId, nodeData?.nodeName, comment, JSON.stringify(nodeData)]
            );
        }

        response.success(res, null, '状态更新成功');
    } catch (error) {
        console.error('n8n回调错误:', error);
        response.error(res, '状态更新失败');
    }
});

// n8n回调：推进到下一节点
router.post('/n8n/proceed', [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('nextNodeId').notEmpty().withMessage('下一节点ID不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { ticketId, nextNodeId, comment, formData } = req.body;

        // 验证API密钥
        const apiKey = req.headers['x-api-key'];
        if (process.env.N8N_API_KEY && apiKey !== process.env.N8N_API_KEY) {
            return response.unauthorized(res, '无效的API密钥');
        }

        // 获取工单和流程定义
        const ticket = await db.getOne(
            `SELECT t.*, w.definition_json
             FROM tickets t
             JOIN workflow_definitions w ON t.workflow_id = w.id
             WHERE t.id = ?`,
            [ticketId]
        );

        if (!ticket) {
            return response.error(res, '工单不存在', 404);
        }

        const definition = JSON.parse(ticket.definition_json);
        const nextNode = definition.nodes.find(n => n.id === nextNodeId);

        if (!nextNode) {
            return response.error(res, '下一节点不存在', 400);
        }

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 更新工单当前节点
            await conn.execute(
                `UPDATE tickets SET current_node_id = ?, current_node_name = ?, updated_at = NOW()
                 WHERE id = ?`,
                [nextNodeId, nextNode.name, ticketId]
            );

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment, form_data, next_node_id, next_node_name)
                 VALUES (?, ?, ?, 'n8n_proceed', 0, 'n8n', ?, ?, ?, ?)`,
                [ticketId, ticket.current_node_id, ticket.current_node_name,
                 comment, JSON.stringify(formData), nextNodeId, nextNode.name]
            );

            // 处理新节点的任务分配
            await workflowEngine.processNodeAssignment(conn, ticketId, nextNode, 0, definition);

            await db.commit(conn);
            response.success(res, null, '流程推进成功');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('n8n推进错误:', error);
        response.error(res, '流程推进失败');
    }
});

// n8n回调：创建子工单
router.post('/n8n/create-sub-ticket', [
    body('parentTicketId').isInt().withMessage('父工单ID不能为空'),
    body('workflowId').isInt().withMessage('流程ID不能为空'),
    body('title').notEmpty().withMessage('标题不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { parentTicketId, workflowId, title, description, formData, priority } = req.body;

        // 验证API密钥
        const apiKey = req.headers['x-api-key'];
        if (process.env.N8N_API_KEY && apiKey !== process.env.N8N_API_KEY) {
            return response.unauthorized(res, '无效的API密钥');
        }

        // 创建子工单
        const result = await workflowEngine.createTicket({
            workflowId,
            title,
            description,
            formData,
            priority,
            createdBy: 0  // n8n创建
        });

        // 记录关联关系（可以在history中记录）
        await db.execute(
            `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                       action_by_name, comment)
             VALUES (?, ?, ?, 'create_sub_ticket', 0, 'n8n', ?)`,
            [parentTicketId, null, null, `创建子工单: ${result.ticketNo}`]
        );

        response.success(res, result, '子工单创建成功');
    } catch (error) {
        console.error('创建子工单错误:', error);
        response.error(res, error.message || '创建子工单失败');
    }
});

// n8n回调：发送通知
router.post('/n8n/notify', [
    body('ticketId').isInt().withMessage('工单ID不能为空'),
    body('notifyType').notEmpty().withMessage('通知类型不能为空'),
    body('recipients').isArray().withMessage('接收人必须是数组')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { ticketId, notifyType, recipients, message, channel = 'system' } = req.body;

        // 验证API密钥
        const apiKey = req.headers['x-api-key'];
        if (process.env.N8N_API_KEY && apiKey !== process.env.N8N_API_KEY) {
            return response.unauthorized(res, '无效的API密钥');
        }

        // 获取工单信息
        const ticket = await db.getOne(
            `SELECT t.*, u.real_name as creator_name
             FROM tickets t
             JOIN users u ON t.created_by = u.id
             WHERE t.id = ?`,
            [ticketId]
        );

        // 记录通知历史
        await db.execute(
            `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                       action_by_name, comment, form_data)
             VALUES (?, ?, ?, 'notify', 0, 'n8n', ?, ?)`,
            [ticketId, null, null, message, JSON.stringify({
                notifyType,
                recipients,
                channel,
                ticketNo: ticket.ticket_no
            })]
        );

        // 这里可以集成实际的通知服务（邮件、短信、企业微信等）
        console.log(`发送${notifyType}通知给:`, recipients, '消息:', message);

        response.success(res, null, '通知发送成功');
    } catch (error) {
        console.error('发送通知错误:', error);
        response.error(res, '发送通知失败');
    }
});

// 获取webhook调用日志
router.get('/logs', async (req, res) => {
    try {
        const { ticketId, page = 1, pageSize = 20 } = req.query;

        let sql = `
            SELECT wl.*, t.ticket_no, w.name as workflow_name
            FROM webhook_logs wl
            LEFT JOIN tickets t ON wl.ticket_id = t.id
            LEFT JOIN workflow_definitions w ON wl.workflow_id = w.id
            WHERE 1=1
        `;
        const params = [];

        if (ticketId) {
            sql += ' AND wl.ticket_id = ?';
            params.push(ticketId);
        }

        sql += ' ORDER BY wl.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

        const logs = await db.query(sql, params);

        response.success(res, logs);
    } catch (error) {
        console.error('获取webhook日志错误:', error);
        response.error(res, '获取日志失败');
    }
});

module.exports = router;
