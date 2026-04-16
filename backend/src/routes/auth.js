const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const response = require('../utils/response');
const { generateToken, authMiddleware } = require('../middleware/auth');

// 登录
router.post('/login', [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { username, password } = req.body;

        // 查询用户
        const user = await db.getOne(
            `SELECT u.*, d.name as department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             WHERE u.username = ?`,
            [username]
        );

        if (!user) {
            return response.error(res, '用户名或密码错误', 401);
        }

        if (user.status !== 1) {
            return response.error(res, '账号已被禁用', 403);
        }

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return response.error(res, '用户名或密码错误', 401);
        }

        // 查询用户角色
        const roles = await db.query(
            `SELECT r.id, r.name, r.code
             FROM roles r
             INNER JOIN user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = ? AND r.status = 1`,
            [user.id]
        );

        // 更新最后登录时间
        await db.execute(
            'UPDATE users SET last_login_at = NOW() WHERE id = ?',
            [user.id]
        );

        // 生成token
        const token = generateToken(user.id);

        response.success(res, {
            token,
            user: {
                id: user.id,
                username: user.username,
                realName: user.real_name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar,
                departmentId: user.department_id,
                departmentName: user.department_name,
                roles: roles || []
            }
        }, '登录成功');
    } catch (error) {
        console.error('登录错误:', error);
        response.error(res, '登录失败');
    }
});

// 获取当前用户信息
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await db.getOne(
            `SELECT u.*, d.name as department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        if (!user) {
            return response.error(res, '用户不存在', 404);
        }

        const roles = await db.query(
            `SELECT r.id, r.name, r.code
             FROM roles r
             INNER JOIN user_roles ur ON r.id = ur.role_id
             WHERE ur.user_id = ? AND r.status = 1`,
            [user.id]
        );

        response.success(res, {
            id: user.id,
            username: user.username,
            realName: user.real_name,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            departmentId: user.department_id,
            departmentName: user.department_name,
            roles: roles || []
        });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        response.error(res, '获取用户信息失败');
    }
});

// 修改密码
router.put('/password', authMiddleware, [
    body('oldPassword').notEmpty().withMessage('原密码不能为空'),
    body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return response.badRequest(res, errors.array()[0].msg);
        }

        const { oldPassword, newPassword } = req.body;

        // 查询用户
        const user = await db.getOne(
            'SELECT password FROM users WHERE id = ?',
            [req.user.id]
        );

        // 验证原密码
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) {
            return response.error(res, '原密码错误', 400);
        }

        // 加密新密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 更新密码
        await db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.user.id]
        );

        response.success(res, null, '密码修改成功');
    } catch (error) {
        console.error('修改密码错误:', error);
        response.error(res, '修改密码失败');
    }
});

module.exports = router;
