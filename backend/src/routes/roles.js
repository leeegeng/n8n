const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { authMiddleware } = require('../middleware/auth');

// 获取角色列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status, keyword } = req.query;

        let sql = `
            SELECT r.*,
                   (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) as user_count
            FROM roles r
            WHERE 1=1
        `;
        const params = [];

        if (status !== undefined) {
            sql += ' AND r.status = ?';
            params.push(status);
        }

        if (keyword) {
            sql += ' AND (r.name LIKE ? OR r.code LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        sql += ' ORDER BY r.created_at DESC';

        const roles = await db.query(sql, params);

        response.success(res, roles);
    } catch (error) {
        console.error('获取角色列表错误:', error);
        response.error(res, '获取角色列表失败');
    }
});

// 获取角色详情
router.get('/:id', authMiddleware, [
    param('id').isInt().withMessage('角色ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const role = await db.getOne(
            `SELECT r.*,
                    (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) as user_count
             FROM roles r
             WHERE r.id = ?`,
            [id]
        );

        if (!role) {
            return response.error(res, '角色不存在', 404);
        }

        // 获取角色下的用户
        const users = await db.query(
            `SELECT u.id, u.username, u.real_name, u.email, u.status
             FROM users u
             INNER JOIN user_roles ur ON u.id = ur.user_id
             WHERE ur.role_id = ?`,
            [id]
        );

        response.success(res, { ...role, users });
    } catch (error) {
        console.error('获取角色详情错误:', error);
        response.error(res, '获取角色详情失败');
    }
});

// 创建角色
router.post('/', authMiddleware, [
    body('name').notEmpty().withMessage('角色名称不能为空'),
    body('code').notEmpty().withMessage('角色编码不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { name, code, description } = req.body;

        // 检查编码是否已存在
        const existing = await db.getOne(
            'SELECT id FROM roles WHERE code = ?',
            [code]
        );

        if (existing) {
            return response.error(res, '角色编码已存在', 409);
        }

        const id = await db.insert(
            'INSERT INTO roles (name, code, description) VALUES (?, ?, ?)',
            [name, code, description]
        );

        response.success(res, { id }, '角色创建成功');
    } catch (error) {
        console.error('创建角色错误:', error);
        response.error(res, '创建角色失败');
    }
});

// 更新角色
router.put('/:id', authMiddleware, [
    param('id').isInt().withMessage('角色ID必须是整数'),
    body('name').notEmpty().withMessage('角色名称不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { name, code, description, status } = req.body;

        // 检查角色是否存在
        const role = await db.getOne(
            'SELECT id FROM roles WHERE id = ?',
            [id]
        );

        if (!role) {
            return response.error(res, '角色不存在', 404);
        }

        // 检查编码是否被其他角色使用
        if (code) {
            const existing = await db.getOne(
                'SELECT id FROM roles WHERE code = ? AND id != ?',
                [code, id]
            );

            if (existing) {
                return response.error(res, '角色编码已存在', 409);
            }
        }

        await db.execute(
            'UPDATE roles SET name = ?, code = ?, description = ?, status = ? WHERE id = ?',
            [name, code, description, status !== undefined ? status : 1, id]
        );

        response.success(res, null, '角色更新成功');
    } catch (error) {
        console.error('更新角色错误:', error);
        response.error(res, '更新角色失败');
    }
});

// 删除角色
router.delete('/:id', authMiddleware, [
    param('id').isInt().withMessage('角色ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 检查角色是否存在
        const role = await db.getOne(
            'SELECT id FROM roles WHERE id = ?',
            [id]
        );

        if (!role) {
            return response.error(res, '角色不存在', 404);
        }

        // 检查是否有用户关联
        const users = await db.getOne(
            'SELECT id FROM user_roles WHERE role_id = ? LIMIT 1',
            [id]
        );

        if (users) {
            return response.error(res, '该角色下有用户，无法删除', 400);
        }

        await db.execute('DELETE FROM roles WHERE id = ?', [id]);

        response.success(res, null, '角色删除成功');
    } catch (error) {
        console.error('删除角色错误:', error);
        response.error(res, '删除角色失败');
    }
});

// 获取角色下的用户列表
router.get('/:id/users', authMiddleware, [
    param('id').isInt().withMessage('角色ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const users = await db.query(
            `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status,
                    d.name as department_name
             FROM users u
             INNER JOIN user_roles ur ON u.id = ur.user_id
             LEFT JOIN departments d ON u.department_id = d.id
             WHERE ur.role_id = ?
             ORDER BY u.created_at DESC`,
            [id]
        );

        response.success(res, users);
    } catch (error) {
        console.error('获取角色用户错误:', error);
        response.error(res, '获取角色用户失败');
    }
});

// 为角色分配用户
router.post('/:id/users', authMiddleware, [
    param('id').isInt().withMessage('角色ID必须是整数'),
    body('userIds').isArray().withMessage('userIds必须是数组')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { userIds } = req.body;

        // 检查角色是否存在
        const role = await db.getOne(
            'SELECT id FROM roles WHERE id = ?',
            [id]
        );

        if (!role) {
            return response.error(res, '角色不存在', 404);
        }

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 删除现有关系
            await conn.execute(
                'DELETE FROM user_roles WHERE role_id = ?',
                [id]
            );

            // 添加新关系
            if (userIds && userIds.length > 0) {
                const values = userIds.map(userId => [userId, id]);
                await conn.query(
                    'INSERT INTO user_roles (user_id, role_id) VALUES ?',
                    [values]
                );
            }

            await db.commit(conn);
            response.success(res, null, '用户分配成功');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('分配用户错误:', error);
        response.error(res, '分配用户失败');
    }
});

module.exports = router;
