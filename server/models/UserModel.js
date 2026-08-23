const db = require('../config/db');

class UserModel {
  static async getOrCreate(openId) {
    const existing = await db.query(
      'SELECT * FROM users WHERE open_id = ?',
      [openId]
    );
    if (existing.length > 0) return existing[0];

    await db.query(
      'INSERT INTO users (open_id) VALUES (?)',
      [openId]
    );
    return {
      open_id: openId,
      wx_nick_name: '',
      custom_nick_name: '',
      avatar_url: ''
    };
  }

  static async getByOpenId(openId) {
    const rows = await db.query(
      'SELECT * FROM users WHERE open_id = ?',
      [openId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async updateProfile(openId, data) {
    const fields = [];
    const params = [];

    if (data.wxNickName !== undefined) {
      fields.push('wx_nick_name = ?');
      params.push(data.wxNickName);
    }
    if (data.customNickName !== undefined) {
      fields.push('custom_nick_name = ?');
      params.push(data.customNickName);
    }
    if (data.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      params.push(data.avatarUrl);
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = NOW()');
    params.push(openId);

    await db.query(
      `INSERT INTO users (open_id, wx_nick_name, custom_nick_name, avatar_url, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE ${fields.join(', ')}`,
      [
        openId,
        data.wxNickName || '',
        data.customNickName || '',
        data.avatarUrl || '',
        ...params
      ]
    );

    return UserModel.getByOpenId(openId);
  }

  // 设置/修改 unique_id：uniqueId 合法性与唯一性由调用方处理（UNIQUE 索引兜底捕获 ER_DUP_ENTRY）
  static async setUniqueId(openId, uniqueId) {
    await db.query(
      `UPDATE users SET unique_id = ?, unique_id_updated_at = NOW(), updated_at = NOW() WHERE open_id = ?`,
      [uniqueId, openId]
    );
    return UserModel.getByOpenId(openId);
  }

  // 刷新 last_seen_at（活跃时间，混合判定在线用）
  static async touchLastSeen(openId) {
    if (!openId) return;
    try {
      await db.query(
        'UPDATE users SET last_seen_at = NOW(), updated_at = NOW() WHERE open_id = ?',
        [openId]
      );
    } catch (e) {
      // 忽略活跃时间刷新失败（非关键路径）
    }
  }

  static async getStats() {
    try {
      const rows = await db.query('SELECT COUNT(*) as count FROM users');
      return { totalUsers: rows[0].count };
    } catch (e) {
      return { totalUsers: 0, error: e.message };
    }
  }
}

module.exports = UserModel;
