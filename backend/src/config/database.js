const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'ticket_system',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// 数据库查询辅助函数
const db = {
    // 执行查询
    query: async (sql, params) => {
        const [rows] = await pool.execute(sql, params);
        return rows;
    },

    // 执行插入并返回插入ID
    insert: async (sql, params) => {
        const [result] = await pool.execute(sql, params);
        return result.insertId;
    },

    // 执行更新/删除并返回影响行数
    execute: async (sql, params) => {
        const [result] = await pool.execute(sql, params);
        return result.affectedRows;
    },

    // 获取单行
    getOne: async (sql, params) => {
        const [rows] = await pool.execute(sql, params);
        return rows[0] || null;
    },

    // 获取连接（用于事务）
    getConnection: async () => {
        return await pool.getConnection();
    },

    // 开始事务
    beginTransaction: async (connection) => {
        await connection.beginTransaction();
    },

    // 提交事务
    commit: async (connection) => {
        await connection.commit();
    },

    // 回滚事务
    rollback: async (connection) => {
        await connection.rollback();
    },

    // 释放连接
    release: (connection) => {
        connection.release();
    },

    // 测试连接
    testConnection: async () => {
        try {
            const connection = await pool.getConnection();
            console.log('数据库连接成功');
            connection.release();
            return true;
        } catch (error) {
            console.error('数据库连接失败:', error.message);
            return false;
        }
    }
};

module.exports = db;
