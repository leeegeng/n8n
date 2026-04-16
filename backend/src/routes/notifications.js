const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const response = require('../utils/response');
const n8nWorkflowEngine = require('../services/n8nWorkflowEngine');

/**
 * 通知 API
 * 用于首页消息提醒
 */

// 获取用户通知列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { isRead, page = 1, pageSize = 20 } = req.query;

        const notifications = await n8nWorkflowEngine.getNotifications(req.user.id, {
            isRead: isRead !== undefined ? parseInt(isRead) : undefined,
            page: parseInt(page),
            pageSize: parseInt(pageSize)
        });

        response.success(res, notifications);
    } catch (error) {
        console.error('获取通知失败:', error);
        response.error(res, '获取通知失败');
    }
});

// 获取未读通知数量
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const count = await n8nWorkflowEngine.getUnreadCount(req.user.id);
        response.success(res, { count });
    } catch (error) {
        console.error('获取未读数量失败:', error);
        response.error(res, '获取未读数量失败');
    }
});

// 标记通知为已读
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        await n8nWorkflowEngine.markNotificationRead(req.params.id, req.user.id);
        response.success(res, null, '标记已读成功');
    } catch (error) {
        console.error('标记已读失败:', error);
        response.error(res, '标记已读失败');
    }
});

// 标记所有通知为已读
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        await db.execute(
            'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
            [req.user.id]
        );
        response.success(res, null, '全部标记已读');
    } catch (error) {
        console.error('标记全部已读失败:', error);
        response.error(res, '操作失败');
    }
});

module.exports = router;
