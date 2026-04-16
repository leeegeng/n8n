const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// 导入路由
const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/departments');
const roleRoutes = require('./routes/roles');
const userRoutes = require('./routes/users');
const workflowRoutes = require('./routes/workflows');
const ticketRoutes = require('./routes/tickets');
const webhookRoutes = require('./routes/webhook');
const notificationRoutes = require('./routes/notifications');
const apiDocRoutes = require('./routes/apidoc');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/notifications', notificationRoutes);

// API 文档路由
app.use('/api-docs', apiDocRoutes);

// 404处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
    try {
        // 测试数据库连接
        const dbConnected = await db.testConnection();
        if (!dbConnected) {
            console.error('数据库连接失败，请检查配置');
            process.exit(1);
        }

        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║     工单系统后端服务已启动                              ║
║                                                        ║
║     服务地址: http://localhost:${PORT}                   ║
║     API文档: http://localhost:${PORT}/api-docs          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('启动服务器失败:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
