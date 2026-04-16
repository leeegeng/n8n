const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { authMiddleware, requireRole } = require('../middleware/auth');

// 获取用户列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status, departmentId, keyword, page = 1, pageSize = 10 } = req.query;

        let sql = `
            SELECT u.id, u.username, u.real_name, u.email, u.phone, u.avatar,
                   u.status, u.last_login_at, u.created_at,
                   d.id as department_id, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE 1=1
        `;
        const params = [];
        const countParams = [];

        if (status !== undefined) {
            sql += ' AND u.status = ?';
            params.push(status);
            countParams.push(status);
        }

        if (departmentId) {
            sql += ' AND u.department_id = ?';
            params.push(departmentId);
            countParams.push(departmentId);
        }

        if (keyword) {
            sql += ' AND (u.username LIKE ? OR u.real_name LIKE ? OR u.email LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
            countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        // 获取总数
        const countResult = await db.getOne(
            `SELECT COUNT(*) as total FROM users u WHERE 1=1
             ${status !== undefined ? ' AND u.status = ?' : ''}
             ${departmentId ? ' AND u.department_id = ?' : ''}
             ${keyword ? ' AND (u.username LIKE ? OR u.real_name LIKE ? OR u.email LIKE ?)' : ''}`,
            countParams
        );

        const total = countResult.total;

        // 分页查询
        sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize));

        const users = await db.query(sql, params);

        // 查询每个用户的角色
        for (const user of users) {
            const roles = await db.query(
                `SELECT r.id, r.name, r.code
                 FROM roles r
                 INNER JOIN user_roles ur ON r.id = ur.role_id
                 WHERE ur.user_id = ?`,
                [user.id]
            );
            user.roles = roles;
        }

        response.page(res, users, { page: parseInt(page), pageSize: parseInt(pageSize), total });
    } catch (error) {
        console.error('获取用户列表错误:', error);
        response.error(res, '获取用户列表失败');
    }
});

// 获取用户详情
router.get('/:id', authMiddleware, [
    param('id').isInt().withMessage('用户ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        const user = await db.getOne(
            `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.avatar,
                    u.status, u.last_login_at, u.created_at,
                    d.id as department_id, d.name as department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             WHERE u.id = ?`,
            [id]
        );

        if (!user) {
            return response.error(res, '用户不存在', 404);
        }

        // 查询用户角色
        const roles = await db.query(
            `SELECT r.id, r.name, r.code
             FROM roles r
             INNER JOIN user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = ?`,
            [id]
        );

        user.roles = roles;

        response.success(res, user);
    } catch (error) {
        console.error('获取用户详情错误:', error);
        response.error(res, '获取用户详情失败');
    }
});

// 创建用户
router.post('/', authMiddleware, requireRole('admin'), [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
    body('realName').notEmpty().withMessage('真实姓名不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { username, password, realName, email, phone, departmentId, roleIds } = req.body;

        // 检查用户名是否已存在
        const existing = await db.getOne(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existing) {
            return response.error(res, '用户名已存在', 409);
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 创建用户
            const userId = await conn.execute(
                `INSERT INTO users (username, password, real_name, email, phone, department_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [username, hashedPassword, realName, email, phone, departmentId || null]
            );

            const newUserId = userId[0].insertId;

            // 分配角色
            if (roleIds && roleIds.length > 0) {
                const values = roleIds.map(roleId => [newUserId, roleId]);
                await conn.query(
                    'INSERT INTO user_roles (user_id, role_id) VALUES ?',
                    [values]
                );
            }

            await db.commit(conn);
            response.success(res, { id: newUserId }, '用户创建成功');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('创建用户错误:', error);
        response.error(res, '创建用户失败');
    }
});

// 更新用户
router.put('/:id', authMiddleware, [
    param('id').isInt().withMessage('用户ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { realName, email, phone, departmentId, status, roleIds } = req.body;

        // 检查用户是否存在
        const user = await db.getOne(
            'SELECT id FROM users WHERE id = ?',
            [id]
        );

        if (!user) {
            return response.error(res, '用户不存在', 404);
        }

        // 普通用户只能修改自己
        if (req.user.id !== parseInt(id) && !req.user.roles.some(r => r.code === 'admin')) {
            return response.forbidden(res);
        }

        const conn = await db.getConnection();
        try {
            await db.beginTransaction(conn);

            // 更新用户信息
            await conn.execute(
                `UPDATE users
                 SET real_name = ?, email = ?, phone = ?, department_id = ?, status = ?
                 WHERE id = ?`,
                [realName, email, phone, departmentId || null, status !== undefined ? status : 1, id]
            );

            // 更新角色（仅管理员可操作）
            if (roleIds !== undefined && req.user.roles.some(r => r.code === 'admin')) {
                await conn.execute(
                    'DELETE FROM user_roles WHERE user_id = ?',
                    [id]
                );

                if (roleIds.length > 0) {
                    const values = roleIds.map(roleId => [id, roleId]);
                    await conn.query(
                        'INSERT INTO user_roles (user_id, role_id) VALUES ?',
                        [values]
                    );
                }
            }

            await db.commit(conn);
            response.success(res, null, '用户更新成功');
        } catch (error) {
            await db.rollback(conn);
            throw error;
        } finally {
            db.release(conn);
        }
    } catch (error) {
        console.error('更新用户错误:', error);
        response.error(res, '更新用户失败');
    }
});

// 重置密码
router.put('/:id/reset-password', authMiddleware, requireRole('admin'), [
    param('id').isInt().withMessage('用户ID必须是整数'),
    body('newPassword').isLength({ min: 6 }).withMessage('密码至少6位')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;
        const { newPassword } = req.body;

        // 检查用户是否存在
        const user = await db.getOne(
            'SELECT id FROM users WHERE id = ?',
            [id]
        );

        if (!user) {
            return response.error(res, '用户不存在', 404);
        }

        // 加密新密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, id]
        );

        response.success(res, null, '密码重置成功');
    } catch (error) {
        console.error('重置密码错误:', error);
        response.error(res, '重置密码失败');
    }
});

// 删除用户
router.delete('/:id', authMiddleware, requireRole('admin'), [
    param('id').isInt().withMessage('用户ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { id } = req.params;

        // 不能删除自己
        if (req.user.id === parseInt(id)) {
            return response.error(res, '不能删除当前登录用户', 400);
        }

        // 检查用户是否存在
        const user = await db.getOne(
            'SELECT id FROM users WHERE id = ?',
            [id]
        );

        if (!user) {
            return response.error(res, '用户不存在', 404);
        }

        await db.execute('DELETE FROM users WHERE id = ?', [id]);

        response.success(res, null, '用户删除成功');
    } catch (error) {
        console.error('删除用户错误:', error);
        response.error(res, '删除用户失败');
    }
});

// 获取当前用户可选择的用户列表（用于指派）
router.get('/select/list', authMiddleware, async (req, res) => {
    try {
        const { departmentId, roleId } = req.query;

        let sql = `
            SELECT u.id, u.username, u.real_name, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.status = 1
        `;
        const params = [];

        if (departmentId) {
            sql += ' AND u.department_id = ?';
            params.push(departmentId);
        }

        if (roleId) {
            sql += ' AND u.id IN (SELECT user_id FROM user_roles WHERE role_id = ?)';
            params.push(roleId);
        }

        sql += ' ORDER BY u.real_name ASC';

        const users = await db.query(sql, params);

        response.success(res, users);
    } catch (error) {
        console.error('获取用户选择列表错误:', error);
        response.error(res, '获取用户列表失败');
    }
});

module.exports = router;
