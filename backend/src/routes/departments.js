const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { authMiddleware } = require('../middleware/auth');

// 获取部门列表（树形结构）
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status } = req.query;

        let sql = `
            SELECT d.*,
                   (SELECT COUNT(*) FROM users WHERE department_id = d.id AND status = 1) as user_count
            FROM departments d
            WHERE 1=1
        `;
        const params = [];

        if (status !== undefined) {
            sql += ' AND d.status = ?';
            params.push(status);
        }

        sql += ' ORDER BY d.sort_order ASC, d.created_at ASC';

        const departments = await db.query(sql, params);

        // 构建树形结构
        const buildTree = (list, parentId = null) => {
            return list
                .filter(item => item.parent_id === parentId)
                .map(item => ({
                    ...item,
                    children: buildTree(list, item.id)
                }));
        };

        const tree = buildTree(departments);

        response.success(res, tree);
    } catch (error) {
        console.error('获取部门列表错误:', error);
        response.error(res, '获取部门列表失败');
    }
});

// 获取部门详情
router.get('/:id', authMiddleware, [
    param('id').isInt().withMessage('部门ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const department = await db.getOne(
            `SELECT d.*,
                    (SELECT COUNT(*) FROM users WHERE department_id = d.id AND status = 1) as user_count,
                    p.name as parent_name
             FROM departments d
             LEFT JOIN departments p ON d.parent_id = p.id
             WHERE d.id = ?`,
            [id]
        );

        if (!department) {
            return response.error(res, '部门不存在', 404);
        }

        response.success(res, department);
    } catch (error) {
        console.error('获取部门详情错误:', error);
        response.error(res, '获取部门详情失败');
    }
});

// 创建部门
router.post('/', authMiddleware, [
    body('name').notEmpty().withMessage('部门名称不能为空'),
    body('code').notEmpty().withMessage('部门编码不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { name, code, parent_id, description, sort_order } = req.body;

        // 检查编码是否已存在
        const existing = await db.getOne(
            'SELECT id FROM departments WHERE code = ?',
            [code]
        );

        if (existing) {
            return response.error(res, '部门编码已存在', 409);
        }

        // 检查父部门是否存在
        if (parent_id) {
            const parent = await db.getOne(
                'SELECT id FROM departments WHERE id = ?',
                [parent_id]
            );
            if (!parent) {
                return response.error(res, '父部门不存在', 400);
            }
        }

        const id = await db.insert(
            `INSERT INTO departments (name, code, parent_id, description, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [name, code, parent_id || null, description, sort_order || 0]
        );

        response.success(res, { id }, '部门创建成功');
    } catch (error) {
        console.error('创建部门错误:', error);
        response.error(res, '创建部门失败');
    }
});

// 更新部门
router.put('/:id', authMiddleware, [
    param('id').isInt().withMessage('部门ID必须是整数'),
    body('name').notEmpty().withMessage('部门名称不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { name, code, parent_id, description, sort_order, status } = req.body;

        // 检查部门是否存在
        const department = await db.getOne(
            'SELECT id FROM departments WHERE id = ?',
            [id]
        );

        if (!department) {
            return response.error(res, '部门不存在', 404);
        }

        // 检查编码是否被其他部门使用
        if (code) {
            const existing = await db.getOne(
                'SELECT id FROM departments WHERE code = ? AND id != ?',
                [code, id]
            );

            if (existing) {
                return response.error(res, '部门编码已存在', 409);
            }
        }

        // 不能将自己设为父部门
        if (parent_id && parseInt(parent_id) === parseInt(id)) {
            return response.error(res, '不能将自己设为父部门', 400);
        }

        await db.execute(
            `UPDATE departments
             SET name = ?, code = ?, parent_id = ?, description = ?, sort_order = ?, status = ?
             WHERE id = ?`,
            [name, code, parent_id || null, description, sort_order || 0, status !== undefined ? status : 1, id]
        );

        response.success(res, null, '部门更新成功');
    } catch (error) {
        console.error('更新部门错误:', error);
        response.error(res, '更新部门失败');
    }
});

// 删除部门
router.delete('/:id', authMiddleware, [
    param('id').isInt().withMessage('部门ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 检查部门是否存在
        const department = await db.getOne(
            'SELECT id FROM departments WHERE id = ?',
            [id]
        );

        if (!department) {
            return response.error(res, '部门不存在', 404);
        }

        // 检查是否有子部门
        const children = await db.getOne(
            'SELECT id FROM departments WHERE parent_id = ? LIMIT 1',
            [id]
        );

        if (children) {
            return response.error(res, '该部门下有子部门，无法删除', 400);
        }

        // 检查是否有用户
        const users = await db.getOne(
            'SELECT id FROM users WHERE department_id = ? LIMIT 1',
            [id]
        );

        if (users) {
            return response.error(res, '该部门下有用户，无法删除', 400);
        }

        await db.execute('DELETE FROM departments WHERE id = ?', [id]);

        response.success(res, null, '部门删除成功');
    } catch (error) {
        console.error('删除部门错误:', error);
        response.error(res, '删除部门失败');
    }
});

// 获取部门下的用户
router.get('/:id/users', authMiddleware, [
    param('id').isInt().withMessage('部门ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const users = await db.query(
            `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status, u.created_at
             FROM users u
             WHERE u.department_id = ?
             ORDER BY u.created_at DESC`,
            [id]
        );

        response.success(res, users);
    } catch (error) {
        console.error('获取部门用户错误:', error);
        response.error(res, '获取部门用户失败');
    }
});

module.exports = router;
