// 统一响应格式

const response = {
    // 成功响应
    success: (res, data = null, message = '操作成功') => {
        res.json({
            code: 200,
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    },

    // 错误响应
    error: (res, message = '操作失败', code = 500, statusCode = 200) => {
        res.status(statusCode).json({
            code,
            success: false,
            message,
            data: null,
            timestamp: new Date().toISOString()
        });
    },

    // 分页响应
    page: (res, list, pagination) => {
        res.json({
            code: 200,
            success: true,
            message: '查询成功',
            data: {
                list,
                pagination: {
                    page: pagination.page,
                    pageSize: pagination.pageSize,
                    total: pagination.total,
                    totalPages: Math.ceil(pagination.total / pagination.pageSize)
                }
            },
            timestamp: new Date().toISOString()
        });
    },

    // 未授权
    unauthorized: (res, message = '未授权访问') => {
        res.status(401).json({
            code: 401,
            success: false,
            message,
            data: null,
            timestamp: new Date().toISOString()
        });
    },

    // 禁止访问
    forbidden: (res, message = '禁止访问') => {
        res.status(403).json({
            code: 403,
            success: false,
            message,
            data: null,
            timestamp: new Date().toISOString()
        });
    },

    // 参数错误
    badRequest: (res, message = '请求参数错误') => {
        res.status(400).json({
            code: 400,
            success: false,
            message,
            data: null,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = response;
