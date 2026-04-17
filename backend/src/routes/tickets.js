const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { authMiddleware } = require('../middleware/auth');
const n8nWorkflowEngine = require('../services/n8nWorkflowEngine');

// 获取工单列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const {
            status, workflowId, priority, keyword,
            createdBy, page = 1, pageSize = 10
        } = req.query;

        let sql = `
            SELECT t.id, t.ticket_no, t.title, t.description, t.priority, t.status,
                   t.current_node_name, t.created_at, t.updated_at, t.completed_at,
                   u.real_name as creator_name,
                   w.name as workflow_name
            FROM tickets t
            JOIN users u ON t.created_by = u.id
            JOIN workflow_definitions w ON t.workflow_id = w.id
            WHERE 1=1
        `;
        const params = [];
        const countParams = [];

        if (status !== undefined) {
            sql += ' AND t.status = ?';
            params.push(status);
            countParams.push(status);
        }

        if (workflowId) {
            sql += ' AND t.workflow_id = ?';
            params.push(workflowId);
            countParams.push(workflowId);
        }

        if (priority) {
            sql += ' AND t.priority = ?';
            params.push(priority);
            countParams.push(priority);
        }

        if (createdBy) {
            sql += ' AND t.created_by = ?';
            params.push(createdBy);
            countParams.push(createdBy);
        }

        if (keyword) {
            sql += ' AND (t.title LIKE ? OR t.ticket_no LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
            countParams.push(`%${keyword}%`, `%${keyword}%`);
        }

        // 获取总数
        const countResult = await db.getOne(
            `SELECT COUNT(*) as total FROM tickets t WHERE 1=1
             ${status !== undefined ? ' AND t.status = ?' : ''}
             ${workflowId ? ' AND t.workflow_id = ?' : ''}
             ${priority ? ' AND t.priority = ?' : ''}
             ${createdBy ? ' AND t.created_by = ?' : ''}
             ${keyword ? ' AND (t.title LIKE ? OR t.ticket_no LIKE ?)' : ''}`,
            countParams
        );

        const total = countResult.total;

        // 分页查询
        sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

        const tickets = await db.query(sql, params);

        response.page(res, tickets, { page: parseInt(page), pageSize: parseInt(pageSize), total });
    } catch (error) {
        console.error('获取工单列表错误:', error);
        response.error(res, '获取工单列表失败');
    }
});

// 获取工单详情
router.get('/:id', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        console.log(`[TicketAPI] 获取工单详情, ID: ${id}`);

        const ticket = await db.getOne(
            `SELECT t.*, u.real_name as creator_name, d.name as department_name,
                    w.name as workflow_name, w.definition_json
             FROM tickets t
             JOIN users u ON t.created_by = u.id
             LEFT JOIN departments d ON u.department_id = d.id
             JOIN workflow_definitions w ON t.workflow_id = w.id
             WHERE t.id = ?`,
            [id]
        );

        console.log(`[TicketAPI] 查询结果:`, ticket ? `找到工单 ${ticket.ticket_no}` : '工单不存在');

        if (!ticket) {
            return response.error(res, '工单不存在', 404);
        }

        // 解析表单数据（MySQL JSON类型可能已自动解析为对象）
        if (ticket.form_data) {
            if (typeof ticket.form_data === 'string') {
                try {
                    ticket.formData = JSON.parse(ticket.form_data);
                } catch (e) {
                    console.warn(`[TicketAPI] form_data 解析失败:`, ticket.form_data);
                    ticket.formData = ticket.form_data;
                }
            } else {
                // 已经是对象格式
                ticket.formData = ticket.form_data;
            }
            delete ticket.form_data;
        }

        // 解析流程定义（MySQL JSON类型可能已自动解析为对象）
        if (ticket.definition_json) {
            if (typeof ticket.definition_json === 'string') {
                try {
                    ticket.workflowDefinition = JSON.parse(ticket.definition_json);
                } catch (e) {
                    console.warn(`[TicketAPI] definition_json 解析失败:`, ticket.definition_json);
                    ticket.workflowDefinition = ticket.definition_json;
                }
            } else {
                // 已经是对象格式
                ticket.workflowDefinition = ticket.definition_json;
            }
            delete ticket.definition_json;
        }

        // 获取流转历史
        const history = await db.query(
            `SELECT th.*, u.real_name as action_by_name_real
             FROM ticket_history th
             LEFT JOIN users u ON th.action_by = u.id
             WHERE th.ticket_id = ?
             ORDER BY th.created_at ASC`,
            [id]
        );

        ticket.history = history.map(h => ({
            ...h,
            actionByName: h.action_by_name || h.action_by_name_real
        }));

        // 获取当前任务
        const tasks = await db.query(
            `SELECT tt.*,
                    CASE
                        WHEN tt.assignee_type = 1 THEN u.real_name
                        WHEN tt.assignee_type = 2 THEN r.name
                        WHEN tt.assignee_type = 3 THEN d.name
                    END as assignee_name
             FROM ticket_tasks tt
             LEFT JOIN users u ON tt.assignee_type = 1 AND tt.assignee_id = u.id
             LEFT JOIN roles r ON tt.assignee_type = 2 AND tt.assignee_id = r.id
             LEFT JOIN departments d ON tt.assignee_type = 3 AND tt.assignee_id = d.id
             WHERE tt.ticket_id = ?
             ORDER BY tt.created_at DESC`,
            [id]
        );

        ticket.tasks = tasks;

        response.success(res, ticket);
    } catch (error) {
        console.error('获取工单详情错误:', error);
        response.error(res, '获取工单详情失败');
    }
});

// 创建工单
router.post('/', authMiddleware, [
    body('workflowId').isInt().withMessage('流程ID不能为空'),
    body('title').notEmpty().withMessage('工单标题不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { workflowId, title, description, formData, priority } = req.body;

        const result = await n8nWorkflowEngine.createTicket({
            workflowId,
            title,
            description,
            formData,
            priority,
            createdBy: req.user.id
        });

        response.success(res, result, '工单创建成功');
    } catch (error) {
        console.error('创建工单错误:', error);
        response.error(res, error.message || '创建工单失败');
    }
});

// 提交审批（支持普通任务和会签）
router.post('/:id/approve', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数'),
    body('action').isIn(['approve', 'reject']).withMessage('操作类型必须是approve或reject')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { nodeId, action, comment } = req.body;

        // 使用 n8n 引擎提交审批
        await n8nWorkflowEngine.submitApproval(parseInt(id), {
            nodeId,
            action,
            comment,
            userId: req.user.id,
            userName: req.user.realName
        });

        response.success(res, null, action === 'approve' ? '审批通过' : '已驳回');
    } catch (error) {
        console.error('审批错误:', error);
        response.error(res, error.message || '审批失败');
    }
});

// 提交会签（保留兼容）
router.post('/:id/countersign', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数'),
    body('countersignId').isInt().withMessage('会签ID不能为空'),
    body('action').isIn(['approve', 'reject']).withMessage('操作类型必须是approve或reject')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { countersignId, action, comment } = req.body;

        // 会签也使用 submitApproval
        const countersign = await db.getOne(
            'SELECT tc.*, tt.node_id FROM ticket_countersign tc JOIN ticket_tasks tt ON tc.task_id = tt.id WHERE tc.id = ?',
            [countersignId]
        );

        await n8nWorkflowEngine.submitApproval(parseInt(id), {
            nodeId: countersign.node_id,
            action,
            comment,
            userId: req.user.id,
            userName: req.user.realName
        });

        response.success(res, null, '会签提交成功');
    } catch (error) {
        console.error('会签错误:', error);
        response.error(res, error.message || '会签失败');
    }
});

// 转派任务（简化版，直接数据库操作）
router.post('/:id/transfer', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数'),
    body('taskId').isInt().withMessage('任务ID不能为空'),
    body('newAssigneeType').isInt().withMessage('新指派人类型不能为空'),
    body('newAssigneeId').isInt().withMessage('新指派人ID不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { taskId, newAssigneeType, newAssigneeId, comment } = req.body;

        await db.execute(
            `UPDATE ticket_tasks SET status = 2, comment = ?, processed_at = NOW(), processed_by = ?
             WHERE id = ?`,
            [comment, req.user.id, taskId]
        );

        response.success(res, null, '任务转派成功');
    } catch (error) {
        console.error('转派错误:', error);
        response.error(res, error.message || '转派失败');
    }
});

// 获取我的待办任务
router.get('/tasks/todo', authMiddleware, async (req, res) => {
    try {
        // 查询用户的待办任务
        const user = await db.getOne(
            `SELECT u.department_id, GROUP_CONCAT(ur.role_id) as role_ids
             FROM users u
             LEFT JOIN user_roles ur ON u.id = ur.user_id
             WHERE u.id = ?
             GROUP BY u.id`,
            [req.user.id]
        );

        const roleIds = user.role_ids ? user.role_ids.split(',').map(Number) : [];
        const departmentId = user.department_id || 0;

        // 动态构建 IN 子句，避免 mysql2 将数组识别为 JSON
        let roleCondition = '';
        let roleParams = [];
        if (roleIds.length > 0) {
            const placeholders = roleIds.map(() => '?').join(',');
            roleCondition = `OR (tt.assignee_type = 2 AND tt.assignee_id IN (${placeholders}))`;
            roleParams = roleIds;
        }

        const tasks = await db.query(
            `SELECT tt.*, t.ticket_no, t.title, t.priority, t.created_at,
                    u.real_name as creator_name, w.name as workflow_name
             FROM ticket_tasks tt
             JOIN tickets t ON tt.ticket_id = t.id
             JOIN users u ON t.created_by = u.id
             JOIN workflow_definitions w ON t.workflow_id = w.id
             WHERE tt.status = 0
               AND (
                   (tt.assignee_type = 1 AND tt.assignee_id = ?)
                   ${roleCondition}
                   OR (tt.assignee_type = 3 AND tt.assignee_id = ?)
               )
             ORDER BY t.priority DESC, t.created_at ASC`,
            [req.user.id, ...roleParams, departmentId]
        );

        // 查询会签任务
        const countersignTasks = await db.query(
            `SELECT tc.*, tt.node_name, t.ticket_no, t.title, t.priority
             FROM ticket_countersign tc
             JOIN ticket_tasks tt ON tc.task_id = tt.id
             JOIN tickets t ON tc.ticket_id = t.id
             WHERE tc.user_id = ? AND tc.status = 0`,
            [req.user.id]
        );

        response.success(res, {
            approvalTasks: tasks,
            countersignTasks
        });
    } catch (error) {
        console.error('获取待办任务错误:', error);
        response.error(res, '获取待办任务失败');
    }
});

// 获取我创建的工单
router.get('/my/created', authMiddleware, async (req, res) => {
    try {
        const { status, page = 1, pageSize = 10 } = req.query;

        let sql = `
            SELECT t.id, t.ticket_no, t.title, t.priority, t.status,
                   t.current_node_name, t.created_at, t.updated_at,
                   w.name as workflow_name
            FROM tickets t
            JOIN workflow_definitions w ON t.workflow_id = w.id
            WHERE t.created_by = ?
        `;
        const params = [req.user.id];

        if (status !== undefined) {
            sql += ' AND t.status = ?';
            params.push(status);
        }

        const countResult = await db.getOne(
            `SELECT COUNT(*) as total FROM tickets WHERE created_by = ?
             ${status !== undefined ? ' AND status = ?' : ''}`,
            status !== undefined ? [req.user.id, status] : [req.user.id]
        );

        sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

        const tickets = await db.query(sql, params);

        response.page(res, tickets, { page: parseInt(page), pageSize: parseInt(pageSize), total: countResult.total });
    } catch (error) {
        console.error('获取我的工单错误:', error);
        response.error(res, '获取我的工单失败');
    }
});

// 取消工单
router.post('/:id/cancel', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { comment } = req.body;

        // 检查工单是否存在
        const ticket = await db.getOne(
            'SELECT id, created_by, status FROM tickets WHERE id = ?',
            [id]
        );

        if (!ticket) {
            return response.error(res, '工单不存在', 404);
        }

        // 只有创建人或管理员可以取消
        if (ticket.created_by !== req.user.id && !req.user.roles.some(r => r.code === 'admin')) {
            return response.forbidden(res, '只有创建人或管理员可以取消工单');
        }

        if (ticket.status !== 1) {
            return response.error(res, '只能取消进行中的工单', 400);
        }

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 更新工单状态
            await conn.execute(
                `UPDATE tickets SET status = 0, current_node_name = '已取消', updated_at = NOW() WHERE id = ?`,
                [id]
            );

            // 记录历史
            await conn.execute(
                `INSERT INTO ticket_history (ticket_id, node_id, node_name, action, action_by,
                                           action_by_name, comment)
                 VALUES (?, ?, ?, 'cancel', ?, ?, ?)`,
                [id, null, null, req.user.id, req.user.realName, comment || '用户取消']
            );

            // 关闭所有待办任务
            await conn.execute(
                `UPDATE ticket_tasks SET status = 1, result = 2, processed_at = NOW()
                 WHERE ticket_id = ? AND status = 0`,
                [id]
            );

            await db.commit(conn);
            response.success(res, null, '工单已取消');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('取消工单错误:', error);
        response.error(res, '取消工单失败');
    }
});

// 删除工单
router.delete('/:id', authMiddleware, [
    param('id').isInt().withMessage('工单ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const userId = req.user.id;

        // 检查工单是否存在
        const ticket = await db.getOne(
            'SELECT id, status, created_by FROM tickets WHERE id = ?',
            [id]
        );

        if (!ticket) {
            return response.error(res, '工单不存在', 404);
        }

        // 只有创建者或管理员可以删除
        const isAdmin = req.user.roles && req.user.roles.some(role => role.code === 'admin');
        if (ticket.created_by !== userId && !isAdmin) {
            return response.error(res, '无权删除此工单', 403);
        }

        // 只有已取消或已完成的工单可以删除
        if (ticket.status !== 0 && ticket.status !== 2) {
            return response.error(res, '只能删除已取消或已完成的工单', 400);
        }

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 删除工单历史记录
            await db.execute(
                'DELETE FROM ticket_history WHERE ticket_id = ?',
                [id],
                conn
            );

            // 删除工单任务
            await db.execute(
                'DELETE FROM ticket_tasks WHERE ticket_id = ?',
                [id],
                conn
            );

            // 删除工单
            await db.execute(
                'DELETE FROM tickets WHERE id = ?',
                [id],
                conn
            );

            await db.commit(conn);
            response.success(res, null, '工单删除成功');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('删除工单错误:', error);
        response.error(res, '删除工单失败');
    }
});

module.exports = router;
