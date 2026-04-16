/**
 * 添加 n8n_config 字段到 workflow_definitions 表
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

async function addColumn() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        await connection.query(`
            ALTER TABLE workflow_definitions 
            ADD COLUMN n8n_config JSON COMMENT 'n8n配置(webhookUrl等)'
        `);
        
        console.log('n8n_config 字段添加成功');
        
    } catch (error) {
        if (error.message.includes('Duplicate column')) {
            console.log('n8n_config 字段已存在');
        } else {
            console.error('添加字段失败:', error.message);
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addColumn();
