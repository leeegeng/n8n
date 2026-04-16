const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { authMiddleware } = require('../middleware/auth');

// 获取流程定义列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status, keyword } = req.query;

        let sql = `
            SELECT w.id, w.name, w.code, w.description, w.version, w.status,
                   w.form_schema, w.created_at, w.updated_at,
                   u.real_name as created_by_name
            FROM workflow_definitions w
            LEFT JOIN users u ON w.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status !== undefined) {
            sql += ' AND w.status = ?';
            params.push(status);
        }

        if (keyword) {
            sql += ' AND (w.name LIKE ? OR w.code LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        sql += ' ORDER BY w.created_at DESC';

        const workflows = await db.query(sql, params);

        // 处理 form_schema 字段 (MySQL JSON 类型已自动解析为对象)
        const result = workflows.map(w => {
            if (w.form_schema) {
                // MySQL JSON 类型返回的已经是对象，直接使用
                if (typeof w.form_schema === 'object') {
                    w.formSchema = w.form_schema;
                } else {
                    // 兼容字符串格式的 JSON
                    try {
                        w.formSchema = JSON.parse(w.form_schema);
                    } catch (e) {
                        console.warn(`流程 ${w.name} 的 form_schema 解析失败`);
                        w.formSchema = null;
                    }
                }
            }
            delete w.form_schema;
            return w;
        });

        response.success(res, result);
    } catch (error) {
        console.error('获取流程列表错误:', error);
        response.error(res, '获取流程列表失败');
    }
});

// 获取流程定义详情
router.get('/:id', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const workflow = await db.getOne(
            `SELECT w.*, u.real_name as created_by_name
             FROM workflow_definitions w
             LEFT JOIN users u ON w.created_by = u.id
             WHERE w.id = ?`,
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 解析JSON字段
        if (workflow.definition_json) {
            try {
                // 处理已经被解析为对象的情况（如 '[object Object]'）
                if (typeof workflow.definition_json === 'object') {
                    workflow.definition = workflow.definition_json;
                } else if (workflow.definition_json === '[object Object]') {
                    workflow.definition = {};
                } else {
                    workflow.definition = JSON.parse(workflow.definition_json);
                }
            } catch (e) {
                console.warn('解析 definition_json 失败:', workflow.definition_json);
                workflow.definition = {};
            }
            delete workflow.definition_json;
        }

        if (workflow.form_schema) {
            try {
                if (typeof workflow.form_schema === 'object') {
                    workflow.formSchema = workflow.form_schema;
                } else if (workflow.form_schema === '[object Object]') {
                    workflow.formSchema = {};
                } else {
                    workflow.formSchema = JSON.parse(workflow.form_schema);
                }
            } catch (e) {
                console.warn('解析 form_schema 失败:', workflow.form_schema);
                workflow.formSchema = {};
            }
            delete workflow.form_schema;
        }

        response.success(res, workflow);
    } catch (error) {
        console.error('获取流程详情错误:', error);
        response.error(res, '获取流程详情失败');
    }
});

// 创建流程定义
router.post('/', authMiddleware, [
    body('name').notEmpty().withMessage('流程名称不能为空'),
    body('definition').isObject().withMessage('流程定义不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { name, code, description, definition, formSchema } = req.body;

        // 检查编码是否已存在
        if (code) {
            const existing = await db.getOne(
                'SELECT id FROM workflow_definitions WHERE code = ?',
                [code]
            );

            if (existing) {
                return response.error(res, '流程编码已存在', 409);
            }
        }

        const id = await db.insert(
            `INSERT INTO workflow_definitions (name, code, description, definition_json, form_schema, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, code, description, JSON.stringify(definition),
             formSchema ? JSON.stringify(formSchema) : null, req.user.id]
        );

        response.success(res, { id }, '流程创建成功');
    } catch (error) {
        console.error('创建流程错误:', error);
        response.error(res, '创建流程失败');
    }
});

// 更新流程定义
router.put('/:id', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { name, code, description, definition, formSchema, status } = req.body;

        // 检查流程是否存在
        const workflow = await db.getOne(
            'SELECT id, status FROM workflow_definitions WHERE id = ?',
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 已发布的流程不能直接修改定义，需要创建新版本
        if (workflow.status === 1 && definition) {
            return response.error(res, '已发布的流程不能直接修改，请创建新版本', 400);
        }

        // 检查编码是否被其他流程使用
        if (code) {
            const existing = await db.getOne(
                'SELECT id FROM workflow_definitions WHERE code = ? AND id != ?',
                [code, id]
            );

            if (existing) {
                return response.error(res, '流程编码已存在', 409);
            }
        }

        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }

        if (code !== undefined) {
            updates.push('code = ?');
            params.push(code);
        }

        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }

        if (definition !== undefined) {
            updates.push('definition_json = ?');
            params.push(JSON.stringify(definition));
        }

        if (formSchema !== undefined) {
            updates.push('form_schema = ?');
            params.push(JSON.stringify(formSchema));
        }

        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }

        if (updates.length === 0) {
            return response.badRequest(res, '没有要更新的字段');
        }

        params.push(id);

        await db.execute(
            `UPDATE workflow_definitions SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        response.success(res, null, '流程更新成功');
    } catch (error) {
        console.error('更新流程错误:', error);
        response.error(res, '更新流程失败');
    }
});

// 发布流程
router.post('/:id/publish', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 检查流程是否存在
        const workflow = await db.getOne(
            'SELECT id, definition_json FROM workflow_definitions WHERE id = ?',
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 验证流程定义
        const definition = JSON.parse(workflow.definition_json);

        if (!definition.nodes || definition.nodes.length === 0) {
            return response.error(res, '流程定义不完整，缺少节点', 400);
        }

        const startNode = definition.nodes.find(n => n.type === 'start');
        const endNode = definition.nodes.find(n => n.type === 'end');

        if (!startNode) {
            return response.error(res, '流程缺少开始节点', 400);
        }

        if (!endNode) {
            return response.error(res, '流程缺少结束节点', 400);
        }

        // 更新状态为已发布
        await db.execute(
            'UPDATE workflow_definitions SET status = 1 WHERE id = ?',
            [id]
        );

        response.success(res, null, '流程发布成功');
    } catch (error) {
        console.error('发布流程错误:', error);
        response.error(res, '发布流程失败');
    }
});

// 取消发布流程（回到草稿状态）
router.post('/:id/unpublish', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 检查流程是否存在
        const workflow = await db.getOne(
            'SELECT id, status FROM workflow_definitions WHERE id = ?',
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 只有已发布的流程才能取消发布
        if (workflow.status !== 1) {
            return response.error(res, '只有已发布的流程才能取消发布', 400);
        }

        // 检查是否有进行中的工单使用此流程
        const activeTickets = await db.getOne(
            `SELECT id FROM tickets 
             WHERE workflow_id = ? AND status IN ('pending', 'processing') 
             LIMIT 1`,
            [id]
        );

        if (activeTickets) {
            return response.error(res, '该流程有进行中的工单，无法取消发布', 400);
        }

        // 更新状态为草稿
        await db.execute(
            'UPDATE workflow_definitions SET status = 0 WHERE id = ?',
            [id]
        );

        response.success(res, null, '流程已取消发布');
    } catch (error) {
        console.error('取消发布流程错误:', error);
        response.error(res, '取消发布流程失败');
    }
});

// 删除流程定义
router.delete('/:id', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 检查流程是否存在
        const workflow = await db.getOne(
            'SELECT id FROM workflow_definitions WHERE id = ?',
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 检查是否有工单使用此流程
        const tickets = await db.getOne(
            'SELECT id FROM tickets WHERE workflow_id = ? LIMIT 1',
            [id]
        );

        if (tickets) {
            return response.error(res, '该流程已有工单使用，无法删除', 400);
        }

        await db.execute('DELETE FROM workflow_definitions WHERE id = ?', [id]);

        response.success(res, null, '流程删除成功');
    } catch (error) {
        console.error('删除流程错误:', error);
        response.error(res, '删除流程失败');
    }
});

// 复制流程（创建新版本）
router.post('/:id/clone', authMiddleware, [
    param('id').isInt().withMessage('流程ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { name } = req.body;

        // 获取原流程
        const workflow = await db.getOne(
            'SELECT * FROM workflow_definitions WHERE id = ?',
            [id]
        );

        if (!workflow) {
            return response.error(res, '流程不存在', 404);
        }

        // 创建新流程
        const newCode = workflow.code ? `${workflow.code}_v${workflow.version + 1}` : null;
        const newName = name || `${workflow.name} (副本)`;

        const newId = await db.insert(
            `INSERT INTO workflow_definitions (name, code, description, definition_json,
                                             form_schema, version, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [newName, newCode, workflow.description, workflow.definition_json,
             workflow.form_schema, workflow.version + 1, req.user.id]
        );

        response.success(res, { id: newId }, '流程复制成功');
    } catch (error) {
        console.error('复制流程错误:', error);
        response.error(res, '复制流程失败');
    }
});

module.exports = router;
