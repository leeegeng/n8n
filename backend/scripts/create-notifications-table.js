/**
 * 创建 notifications 表
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || '172.16.194.119',
    port: process.env.DB_PORT || 33060,
    user: process.env.DB_USER || 'iomsuser',
    password: process.env.DB_PASSWORD || 'kedacom@123',
    database: process.env.DB_NAME || 'ticket_system'
};

async function createTable() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const sql = `
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL COMMENT '接收用户ID',
                type VARCHAR(50) DEFAULT 'system' COMMENT '通知类型: system-系统 ticket-工单',
                title VARCHAR(200) COMMENT '通知标题',
                message TEXT NOT NULL COMMENT '通知内容',
                ticket_id INT COMMENT '关联工单ID',
                extra_data JSON COMMENT '额外数据',
                is_read TINYINT DEFAULT 0 COMMENT '是否已读: 0-未读 1-已读',
                read_at TIMESTAMP NULL COMMENT '阅读时间',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
                INDEX idx_user_read (user_id, is_read),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表'
        `;
        
        await connection.query(sql);
        console.log('notifications 表创建成功');
        
    } catch (error) {
        console.error('创建表失败:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createTable();
