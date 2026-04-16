/**
 * 数据库初始化脚本
 * 用于首次部署时创建数据库和表结构
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || '172.16.194.119',
    port: process.env.DB_PORT || 33060,
    user: process.env.DB_USER || 'iomsuser',
    password: process.env.DB_PASSWORD || 'kedacom@123',
    database: process.env.DB_NAME || 'ticket_system'
};

async function initDatabase() {
    let connection;

    try {
        console.log('正在连接数据库...');

        // 先不指定数据库连接
        connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // 创建数据库
        console.log(`创建数据库: ${dbConfig.database}`);
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS ${dbConfig.database}
             CHARACTER SET utf8mb4
             COLLATE utf8mb4_unicode_ci`
        );

        // 使用数据库
        await connection.query(`USE ${dbConfig.database}`);

        // 读取并执行SQL文件
        const sqlFilePath = path.join(__dirname, '../../database/schema.sql');

        if (!fs.existsSync(sqlFilePath)) {
            console.error('SQL文件不存在:', sqlFilePath);
            process.exit(1);
        }

        console.log('正在执行数据库脚本...');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        // 分割SQL语句并执行
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await connection.query(statement);
            } catch (error) {
                // 忽略已存在的错误
                if (!error.message.includes('Duplicate') &&
                    !error.message.includes('already exists')) {
                    console.warn('执行SQL警告:', error.message);
                }
            }
        }

        console.log('数据库初始化完成！');
        console.log(`数据库: ${dbConfig.database}`);
        console.log('默认账号: admin');
        console.log('默认密码: admin123');

    } catch (error) {
        console.error('数据库初始化失败:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

initDatabase();
