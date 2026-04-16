/**
 * 插入请假审批流程
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

async function insert() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const definitionJson = JSON.stringify({
            nodes: [
                { id: 'start', type: 'start', name: '开始' },
                { id: 'end', type: 'end', name: '结束' }
            ],
            edges: []
        });
        
        const n8nConfig = JSON.stringify({
            webhookUrl: 'http://172.16.194.119:5678/webhook/leave-workflow'
        });
        
        await connection.query(
            `INSERT INTO workflow_definitions (name, code, description, status, definition_json, n8n_config) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['请假审批流程', 'leave', 'n8n控制的请假审批流程', 1, definitionJson, n8nConfig]
        );
        
        console.log('请假审批流程插入成功');
        
    } catch (error) {
        if (error.message.includes('Duplicate entry')) {
            console.log('流程已存在，跳过插入');
        } else {
            console.error('插入失败:', error.message);
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

insert();
