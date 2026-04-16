const jwt = require('jsonwebtoken');
const response = require('../utils/response');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// JWT认证中间件（已禁用，开发测试环境跳过鉴权）
const authMiddleware = async (req, res, next) => {
    // 开发测试环境：使用默认管理员用户
    req.user = {
        id: 1,
        username: 'admin',
        realName: '管理员',
        departmentId: 1,
        departmentName: '管理部',
        roles: [{ id: 1, name: '管理员', code: 'admin' }]
    };
    next();
};

// 生成JWT令牌
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// 可选认证（不强制要求登录，但如果有token会解析）
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, JWT_SECRET);

            const user = await db.getOne(
                `SELECT u.*, d.name as department_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.id = ? AND u.status = 1`,
                [decoded.userId]
            );

            if (user) {
                const roles = await db.query(
                    `SELECT r.id, r.name, r.code
                     FROM roles r
                     INNER JOIN user_roles ur ON r.id = ur.role_id
                     WHERE ur.user_id = ? AND r.status = 1`,
                    [user.id]
                );

                req.user = {
                    id: user.id,
                    username: user.username,
                    realName: user.real_name,
                    departmentId: user.department_id,
                    departmentName: user.department_name,
                    roles: roles || []
                };
            }
        }

        next();
    } catch (error) {
        // 解析失败也不阻止请求
        next();
    }
};

// 角色权限检查
const requireRole = (...roleCodes) => {
    return (req, res, next) => {
        if (!req.user) {
            return response.unauthorized(res);
        }

        const hasRole = req.user.roles.some(role => roleCodes.includes(role.code));

        if (!hasRole) {
            return response.forbidden(res, '权限不足');
        }

        next();
    };
};

module.exports = {
    authMiddleware,
    generateToken,
    optionalAuth,
    requireRole
};
