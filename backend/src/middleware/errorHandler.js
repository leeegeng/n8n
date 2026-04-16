const response = require('../utils/response');

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
    console.error('错误详情:', err);

    // 处理验证错误
    if (err.name === 'ValidationError') {
        return response.badRequest(res, err.message);
    }

    // 处理MySQL错误
    if (err.code === 'ER_DUP_ENTRY') {
        return response.error(res, '数据已存在', 409);
    }

    if (err.code === 'ER_NO_REFERENCED_ROW') {
        return response.error(res, '引用的数据不存在', 400);
    }

    if (err.code === 'ER_ROW_IS_REFERENCED') {
        return response.error(res, '数据被引用，无法删除', 400);
    }

    // 默认错误响应
    response.error(res, err.message || '服务器内部错误');
};

// 404处理
const notFoundHandler = (req, res) => {
    response.error(res, '接口不存在', 404, 404);
};

module.exports = {
    errorHandler,
    notFoundHandler
};
