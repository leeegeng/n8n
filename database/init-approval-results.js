const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function init() {
  // 读取 .env 文件
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  const env = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  });

  console.log('Connecting to database...');
  console.log(`Host: ${env.DB_HOST}, Port: ${env.DB_PORT}, Database: ${env.DB_NAME}`);

  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: env.DB_PORT || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'ticket_system'
  });
  
  try {
    console.log('Creating approval_results table...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS approval_results (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticket_id INT NOT NULL COMMENT '工单ID',
        node_id VARCHAR(100) NOT NULL COMMENT '节点ID',
        action VARCHAR(20) NOT NULL COMMENT '审批操作: approve-通过 reject-驳回',
        comment TEXT COMMENT '审批意见',
        user_id INT NOT NULL COMMENT '审批人ID',
        user_name VARCHAR(100) COMMENT '审批人姓名',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_ticket_node (ticket_id, node_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批结果记录表（供n8n Webhook节点查询）'
    `);
    console.log('✓ approval_results 表创建成功');
  } catch (err) {
    console.error('✗ 创建表失败:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

init();
