const dayjs = require('dayjs');
const db = require('../config/database');

// 生成工单编号
const generateTicketNo = async () => {
    const prefix = 'TK';
    const date = dayjs().format('YYYYMMDD');

    // 查询当天最大序号
    const result = await db.getOne(
        `SELECT ticket_no FROM tickets
         WHERE ticket_no LIKE ?
         ORDER BY ticket_no DESC
         LIMIT 1`,
        [`${prefix}${date}%`]
    );

    let sequence = 1;
    if (result) {
        const lastSequence = parseInt(result.ticket_no.slice(-4));
        sequence = lastSequence + 1;
    }

    const sequenceStr = sequence.toString().padStart(4, '0');
    return `${prefix}${date}${sequenceStr}`;
};

module.exports = {
    generateTicketNo
};
