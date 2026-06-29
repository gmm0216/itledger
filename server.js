const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const iconv = require('iconv-lite');

const app = express();
const upload = multer({ dest: 'uploads/' });
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'data.db');
// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const db = new sqlite3.Database(dbFile);
const tokens = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      avatar_url TEXT,
      login_background_url TEXT,
      is_admin INTEGER DEFAULT 0,
      permissions TEXT DEFAULT '{}',
      can_login INTEGER DEFAULT 0
    )`);

    // 添加 login_background_url 字段迁移（如果表已存在但没有该字段）
    db.all(`PRAGMA table_info(users)`, [], (err, columns) => {
      if (err) return console.error(err);
      const hasLoginBackground = columns.some(col => col.name === 'login_background_url');
      if (!hasLoginBackground) {
        db.run(`ALTER TABLE users ADD COLUMN login_background_url TEXT`, (err) => {
          if (err) console.error('添加 login_background_url 字段失败:', err);
          else console.log('已添加 login_background_url 字段');
        });
      }
      const hasCanLogin = columns.some(col => col.name === 'can_login');
      if (!hasCanLogin) {
        db.run(`ALTER TABLE users ADD COLUMN can_login INTEGER DEFAULT 0`, (err) => {
          if (err) console.error('添加 can_login 字段失败:', err);
          else console.log('已添加 can_login 字段');
        });
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS device_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      logo_url TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      logo_url TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS nvrs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      ip_address TEXT,
      brand_id INTEGER,
      install_location TEXT,
      storage_capacity TEXT,
      note TEXT,
      FOREIGN KEY(brand_id) REFERENCES brands(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      device_type_id INTEGER,
      brand_id INTEGER,
      ip_address TEXT,
      install_location TEXT,
      nvr_id INTEGER,
      note TEXT,
      FOREIGN KEY(device_type_id) REFERENCES device_types(id),
      FOREIGN KEY(brand_id) REFERENCES brands(id),
      FOREIGN KEY(nvr_id) REFERENCES nvrs(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER,
      device_ids TEXT,
      technician_id INTEGER,
      maintenance_time TEXT,
      content TEXT,
      note TEXT,
      FOREIGN KEY(device_id) REFERENCES devices(id),
      FOREIGN KEY(technician_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      success INTEGER,
      login_time TEXT,
      ip_address TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    )`);

    // 添加 device_ids 字段迁移（如果表已存在但没有该字段）
    db.all(`PRAGMA table_info(maintenance_records)`, [], (err, columns) => {
      if (err) return console.error(err);
      const hasDeviceIds = columns.some(col => col.name === 'device_ids');
      if (!hasDeviceIds) {
        db.run(`ALTER TABLE maintenance_records ADD COLUMN device_ids TEXT`, (err) => {
          if (err) console.error('添加 device_ids 字段失败:', err);
          else console.log('已添加 device_ids 字段');
        });
      }
    });

    db.get(`SELECT id FROM users WHERE username = ?`, ['admin'], (err, row) => {
      if (err) return console.error(err);
      if (!row) {
        bcrypt.hash('admin', 10).then((hash) => {
          const permissions = JSON.stringify({
            view_devices: true,
            manage_devices: true,
            view_types: true,
            manage_types: true,
            view_nvrs: true,
            manage_nvrs: true,
            view_records: true,
            manage_records: true,
            manage_users: true,
            import_devices: true,
            export_devices: true
          });
          db.run(`INSERT INTO users (username, password_hash, display_name, is_admin, permissions) VALUES (?, ?, ?, ?, ?)`,
            ['admin', hash, '系统管理员', 1, permissions]);
        });
      }
    });
  });
}

function sendError(res, status, message) {
  res.status(status).json({ success: false, message });
}

function getUserByToken(token, callback) {
  const userId = tokens[token];
  if (!userId) return callback(null, null);
  db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return callback(err);
    if (!user) return callback(null, null);
    user.permissions = JSON.parse(user.permissions || '{}');
    callback(null, user);
  });
}

function requireAuth(req, res, next) {
  const token = req.headers['x-access-token'];
  if (!token) return sendError(res, 401, '请先登录');
  getUserByToken(token, (err, user) => {
    if (err) return sendError(res, 500, '服务器错误');
    if (!user) return sendError(res, 401, '登录已过期，请重新登录');
    req.user = user;
    next();
  });
}

function requirePermission(name) {
  return (req, res, next) => {
    if (req.user.is_admin) return next();
    if (req.user.permissions && req.user.permissions[name]) return next();
    return sendError(res, 403, '权限不足');
  };
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  if (!username || !password) return sendError(res, 400, '用户名或密码不能为空');
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return sendError(res, 500, '服务器错误');
    if (!user) {
      // 记录登录失败日志
      db.run(`INSERT INTO login_logs (username, success, login_time, ip_address) VALUES (?, ?, ?, ?)`,
        [username, 0, new Date().toISOString(), ip]);
      return sendError(res, 401, '账号或密码错误');
    }
    bcrypt.compare(password, user.password_hash).then((match) => {
      if (!match) {
        // 记录登录失败日志
        db.run(`INSERT INTO login_logs (username, success, login_time, ip_address) VALUES (?, ?, ?, ?)`,
          [username, 0, new Date().toISOString(), ip]);
        return sendError(res, 401, '账号或密码错误');
      }
      // 检查用户是否允许登录
      if (!user.can_login && !user.is_admin) {
        // 记录登录失败日志
        db.run(`INSERT INTO login_logs (username, success, login_time, ip_address) VALUES (?, ?, ?, ?)`,
          [username, 0, new Date().toISOString(), ip]);
        return sendError(res, 403, '该账号不允许登录');
      }
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      tokens[token] = user.id;
      user.permissions = JSON.parse(user.permissions || '{}');
      delete user.password_hash;
      // 确保返回login_background_url字段
      const userResponse = {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        login_background_url: user.login_background_url,
        is_admin: user.is_admin,
        permissions: user.permissions
      };
      // 记录登录成功日志
      db.run(`INSERT INTO login_logs (username, success, login_time, ip_address) VALUES (?, ?, ?, ?)`,
        [username, 1, new Date().toISOString(), ip]);
      res.json({ success: true, token, user: userResponse });
    });
  });
});

app.get('/api/verify', requireAuth, (req, res) => {
  const user = req.user;
  delete user.password_hash;
  res.json({ success: true, user });
});

app.get('/api/users', requireAuth, requirePermission('manage_users'), (req, res) => {
  db.all(`SELECT id, username, display_name, avatar_url, login_background_url, is_admin, permissions, can_login FROM users`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取用户失败');
    rows.forEach((row) => { row.permissions = JSON.parse(row.permissions || '{}'); });
    res.json({ success: true, users: rows });
  });
});

app.get('/api/login-logs', requireAuth, (req, res) => {
  // 只有主账号才能查看登录日志
  if (!req.user.is_admin) return sendError(res, 403, '权限不足');
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  db.get(`SELECT COUNT(*) as total FROM login_logs`, [], (err, countRow) => {
    if (err) return sendError(res, 500, '获取登录日志失败');
    const total = countRow.total;

    db.all(`SELECT * FROM login_logs ORDER BY login_time DESC LIMIT ? OFFSET ?`, [pageSize, offset], (err, rows) => {
      if (err) return sendError(res, 500, '获取登录日志失败');
      res.json({ success: true, logs: rows, total });
    });
  });
});

app.get('/api/login-background', (req, res) => {
  // 获取主账号的登录背景配置（无需登录）
  db.get(`SELECT login_background_url FROM users WHERE username = 'admin'`, [], (err, row) => {
    if (err) return sendError(res, 500, '获取登录背景失败');
    res.json({ success: true, login_background_url: row ? row.login_background_url : null });
  });
});

app.get('/api/site-logo', (req, res) => {
  db.get(`SELECT value FROM system_settings WHERE key = 'site_logo_url'`, [], (err, row) => {
    if (err) return sendError(res, 500, '获取 Logo 失败');
    res.json({ success: true, site_logo_url: row && row.value ? row.value : null });
  });
});

app.get('/api/settings', requireAuth, (req, res) => {
  // 只有主账号才能查看系统设置
  if (!req.user.is_admin) return sendError(res, 403, '权限不足');
  db.all(`SELECT * FROM system_settings`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取系统设置失败');
    const settings = {};
    rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, settings });
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  // 只有主账号才能修改系统设置
  if (!req.user.is_admin) return sendError(res, 403, '权限不足');
  const { key, value } = req.body;
  if (!key) return sendError(res, 400, '设置键不能为空');
  db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`, [key, value], function (err) {
    if (err) return sendError(res, 500, '保存设置失败');
    res.json({ success: true });
  });
});

app.get('/api/backup', requireAuth, (req, res) => {
  // 只有主账号才能备份数据
  if (!req.user.is_admin) return sendError(res, 403, '权限不足');
  const fs = require('fs');
  const path = require('path');
  const dbFile = path.join(__dirname, 'data', 'data.db');
  if (!fs.existsSync(dbFile)) {
    return sendError(res, 404, '数据库文件不存在');
  }
  // 生成文件名：data20260617.db 格式
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const filename = `data${year}${month}${day}.db`;
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const fileStream = fs.createReadStream(dbFile);
  fileStream.pipe(res);
  fileStream.on('error', (err) => {
    console.error('备份文件读取失败:', err);
    if (!res.headersSent) {
      sendError(res, 500, '备份文件读取失败');
    }
  });
});

app.post('/api/restore', requireAuth, upload.single('backup'), (req, res) => {
  // 只有主账号才能恢复数据
  if (!req.user.is_admin) return sendError(res, 403, '权限不足');
  if (!req.file) return sendError(res, 400, '备份文件不能为空');
  const fs = require('fs');
  const path = require('path');
  const backupFile = req.file.path;
  fs.copyFileSync(backupFile, path.join(__dirname, 'it_ledger.db'));
  res.json({ success: true });
});

app.post('/api/users', requireAuth, requirePermission('manage_users'), (req, res) => {
  const { username, password, display_name, avatar_url, is_admin, can_login } = req.body;
  if (!username || !password) return sendError(res, 400, '用户名和密码必填');
  bcrypt.hash(password, 10).then((hash) => {
    db.run(`INSERT INTO users (username, password_hash, display_name, avatar_url, is_admin, can_login) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hash, display_name || username, avatar_url || '', is_admin ? 1 : 0, can_login ? 1 : 0], function (err) {
        if (err) return sendError(res, 500, '创建账号失败, 可能用户名已存在');
        res.json({ success: true, user: { id: this.lastID, username, display_name, avatar_url, is_admin, can_login } });
      });
  });
});

app.put('/api/users/:id', requireAuth, requirePermission('manage_users'), (req, res) => {
  const { id } = req.params;
  const { display_name, avatar_url, is_admin, can_login, password, login_background_url } = req.body;
  const updates = [];
  const params = [];
  if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }
  if (is_admin !== undefined) { updates.push('is_admin = ?'); params.push(is_admin ? 1 : 0); }
  if (can_login !== undefined) { updates.push('can_login = ?'); params.push(can_login ? 1 : 0); }
  if (login_background_url !== undefined) { updates.push('login_background_url = ?'); params.push(login_background_url); }
  if (!updates.length) return sendError(res, 400, '没有更新内容');

  if (password) {
    bcrypt.hash(password, 10).then((hash) => {
      updates.push('password_hash = ?');
      params.push(hash);
      params.push(id);
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
        if (err) return sendError(res, 500, '更新用户失败');
        res.json({ success: true });
      });
    });
  } else {
    params.push(id);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) return sendError(res, 500, '更新用户失败');
      res.json({ success: true });
    });
  }
});

app.get('/api/device-types', requireAuth, requirePermission('view_types'), (req, res) => {
  db.all(`SELECT * FROM device_types`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取设备类型失败');
    res.json({ success: true, types: rows });
  });
});

app.post('/api/device-types', requireAuth, requirePermission('manage_types'), (req, res) => {
  const { name, logo_url } = req.body;
  if (!name) return sendError(res, 400, '类型名称不能为空');
  db.run(`INSERT INTO device_types (name, logo_url) VALUES (?, ?)`, [name, logo_url || ''], function (err) {
    if (err) return sendError(res, 500, '保存设备类型失败');
    res.json({ success: true, type: { id: this.lastID, name, logo_url } });
  });
});

app.put('/api/device-types/:id', requireAuth, requirePermission('manage_types'), (req, res) => {
  const { id } = req.params;
  const { name, logo_url } = req.body;
  if (!name) return sendError(res, 400, '类型名称不能为空');
  db.run(`UPDATE device_types SET name = ?, logo_url = ? WHERE id = ?`, [name, logo_url || '', id], function (err) {
    if (err) return sendError(res, 500, '更新设备类型失败');
    res.json({ success: true });
  });
});

app.delete('/api/device-types/:id', requireAuth, requirePermission('manage_types'), (req, res) => {
  db.run(`DELETE FROM device_types WHERE id = ?`, [req.params.id], function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true });
  });
});

app.get('/api/brands', requireAuth, requirePermission('view_types'), (req, res) => {
  db.all(`SELECT * FROM brands`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取品牌失败');
    res.json({ success: true, brands: rows });
  });
});

app.post('/api/brands', requireAuth, requirePermission('manage_types'), (req, res) => {
  const { name, logo_url } = req.body;
  if (!name) return sendError(res, 400, '品牌名称不能为空');
  db.run(`INSERT INTO brands (name, logo_url) VALUES (?, ?)`, [name, logo_url || ''], function (err) {
    if (err) return sendError(res, 500, '保存品牌失败');
    res.json({ success: true, brand: { id: this.lastID, name, logo_url } });
  });
});

app.put('/api/brands/:id', requireAuth, requirePermission('manage_types'), (req, res) => {
  const { id } = req.params;
  const { name, logo_url } = req.body;
  if (!name) return sendError(res, 400, '品牌名称不能为空');
  db.run(`UPDATE brands SET name = ?, logo_url = ? WHERE id = ?`, [name, logo_url || '', id], function (err) {
    if (err) return sendError(res, 500, '更新品牌失败');
    res.json({ success: true });
  });
});

app.delete('/api/brands/:id', requireAuth, requirePermission('manage_types'), (req, res) => {
  db.run(`DELETE FROM brands WHERE id = ?`, [req.params.id], function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true });
  });
});

app.get('/api/nvrs', requireAuth, requirePermission('view_nvrs'), (req, res) => {
  db.all(`SELECT nvrs.*, brands.name AS brand_name, brands.logo_url AS brand_logo FROM nvrs LEFT JOIN brands ON nvrs.brand_id = brands.id`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取录像机失败');
    res.json({ success: true, nvrs: rows });
  });
});

app.post('/api/nvrs', requireAuth, requirePermission('manage_nvrs'), (req, res) => {
  const { name, ip_address, brand_id, install_location, storage_capacity, note } = req.body;
  if (!name) return sendError(res, 400, '录像机名称不能为空');
  db.run(`INSERT INTO nvrs (name, ip_address, brand_id, install_location, storage_capacity, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, ip_address || '', brand_id || null, install_location || '', storage_capacity || '', note || ''], function (err) {
      if (err) return sendError(res, 500, '保存录像机失败');
      res.json({ success: true, nvr: { id: this.lastID, name, ip_address, brand_id, install_location, storage_capacity, note } });
    });
});

app.put('/api/nvrs/:id', requireAuth, requirePermission('manage_nvrs'), (req, res) => {
  const { id } = req.params;
  const { name, ip_address, brand_id, install_location, storage_capacity, note } = req.body;
  db.run(`UPDATE nvrs SET name = ?, ip_address = ?, brand_id = ?, install_location = ?, storage_capacity = ?, note = ? WHERE id = ?`,
    [name, ip_address || '', brand_id || null, install_location || '', storage_capacity || '', note || '', id], function (err) {
      if (err) return sendError(res, 500, '更新录像机失败');
      res.json({ success: true });
    });
});

app.delete('/api/nvrs/:id', requireAuth, requirePermission('manage_nvrs'), (req, res) => {
  db.run(`DELETE FROM nvrs WHERE id = ?`, [req.params.id], function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true });
  });
});

app.get('/api/devices', requireAuth, requirePermission('view_devices'), (req, res) => {
  db.all(`SELECT devices.*, device_types.name AS device_type, device_types.logo_url AS type_logo, brands.name AS brand_name, brands.logo_url AS brand_logo, nvrs.name AS nvr_name
    FROM devices
    LEFT JOIN device_types ON devices.device_type_id = device_types.id
    LEFT JOIN brands ON devices.brand_id = brands.id
    LEFT JOIN nvrs ON devices.nvr_id = nvrs.id`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取设备失败');
    res.json({ success: true, devices: rows });
  });
});

app.post('/api/devices', requireAuth, requirePermission('manage_devices'), (req, res) => {
  const { name, device_type_id, brand_id, ip_address, install_location, nvr_id, note } = req.body;
  if (!name || !device_type_id) return sendError(res, 400, '设备名称和类型必填');
  db.run(`INSERT INTO devices (name, device_type_id, brand_id, ip_address, install_location, nvr_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, device_type_id, brand_id || null, ip_address || '', install_location || '', nvr_id || null, note || ''], function (err) {
      if (err) return sendError(res, 500, '保存设备失败');
      res.json({ success: true, device: { id: this.lastID, name, device_type_id, brand_id, ip_address, install_location, nvr_id, note } });
    });
});

app.put('/api/devices/:id', requireAuth, requirePermission('manage_devices'), (req, res) => {
  const { id } = req.params;
  const { name, device_type_id, brand_id, ip_address, install_location, nvr_id, note } = req.body;
  db.run(`UPDATE devices SET name = ?, device_type_id = ?, brand_id = ?, ip_address = ?, install_location = ?, nvr_id = ?, note = ? WHERE id = ?`,
    [name, device_type_id, brand_id || null, ip_address || '', install_location || '', nvr_id || null, note || '', id], function (err) {
      if (err) return sendError(res, 500, '更新设备失败');
      res.json({ success: true });
    });
});

app.delete('/api/devices/:id', requireAuth, requirePermission('manage_devices'), (req, res) => {
  db.run(`DELETE FROM devices WHERE id = ?`, [req.params.id], function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true });
  });
});

app.post('/api/devices/batch-delete', requireAuth, requirePermission('manage_devices'), (req, res) => {
  const ids = Array.isArray(req.body.ids)
    ? req.body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!ids.length) return sendError(res, 400, '请选择要删除的设备');
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM devices WHERE id IN (${placeholders})`, ids, function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true, deleted: this.changes });
  });
});

app.get('/api/maintenance-records', requireAuth, requirePermission('view_records'), (req, res) => {
  db.all(`SELECT maintenance_records.*, devices.name AS device_name, users.display_name AS technician_name, users.avatar_url AS technician_avatar
    FROM maintenance_records
    LEFT JOIN devices ON maintenance_records.device_id = devices.id
    LEFT JOIN users ON maintenance_records.technician_id = users.id
    ORDER BY maintenance_time DESC`, [], (err, rows) => {
    if (err) return sendError(res, 500, '获取维修记录失败');

    // 处理多设备记录
    const processedRows = rows.map((row) => {
      if (row.device_ids) {
        try {
          const deviceIds = JSON.parse(row.device_ids);
          if (Array.isArray(deviceIds) && deviceIds.length > 0) {
            // 获取多个设备名称
            return new Promise((resolve) => {
              const placeholders = deviceIds.map(() => '?').join(',');
              db.all(`SELECT name FROM devices WHERE id IN (${placeholders})`, deviceIds, (err2, deviceRows) => {
                if (err2 || !deviceRows || deviceRows.length === 0) {
                  resolve({ ...row, device_names: [row.device_name || '未知设备'] });
                } else {
                  resolve({ ...row, device_names: deviceRows.map(d => d.name) });
                }
              });
            });
          }
        } catch (e) {
          // JSON解析失败，使用单个设备名称
          return Promise.resolve({ ...row, device_names: [row.device_name || '未知设备'] });
        }
      }
      return Promise.resolve({ ...row, device_names: [row.device_name || '未知设备'] });
    });

    Promise.all(processedRows).then((finalRows) => {
      res.json({ success: true, records: finalRows });
    }).catch(() => {
      res.json({ success: true, records: rows.map(r => ({ ...r, device_names: [r.device_name || '未知设备'] })) });
    });
  });
});

app.post('/api/maintenance-records', requireAuth, requirePermission('manage_records'), (req, res) => {
  const { device_id, device_ids, technician_id, maintenance_time, content, note } = req.body;

  if (!technician_id || !maintenance_time || !content) {
    const missing = [];
    if (!technician_id) missing.push('technician_id');
    if (!maintenance_time) missing.push('maintenance_time');
    if (!content) missing.push('content');
    return sendError(res, 400, `维修人员、时间和内容必填 (缺少: ${missing.join(', ')})`);
  }

  const deviceIds = Array.isArray(device_ids)
    ? device_ids.map((id) => Number(id)).filter((value) => Number.isInteger(value) && value > 0)
    : device_id ? [Number(device_id)] : [];

  // 将多个设备ID存储为JSON字符串
  const deviceIdsJson = deviceIds.length > 0 ? JSON.stringify(deviceIds) : null;
  const singleDeviceId = deviceIds.length === 1 ? deviceIds[0] : null;

  db.run(`INSERT INTO maintenance_records (device_id, device_ids, technician_id, maintenance_time, content, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [singleDeviceId, deviceIdsJson, technician_id, maintenance_time, content, note || ''], function (err) {
      if (err) return sendError(res, 500, '保存维修记录失败');
      res.json({ success: true, message: '已保存维修记录' });
    });
});

app.put('/api/maintenance-records/:id', requireAuth, requirePermission('manage_records'), (req, res) => {
  const { id } = req.params;
  const { device_id, device_ids, technician_id, maintenance_time, content, note } = req.body;

  if (!technician_id || !maintenance_time || !content) {
    return sendError(res, 400, '维修人员、时间和内容必填');
  }

  const deviceIds = Array.isArray(device_ids)
    ? device_ids.map((id) => Number(id)).filter((value) => Number.isInteger(value) && value > 0)
    : device_id ? [Number(device_id)] : [];

  const deviceIdsJson = deviceIds.length > 0 ? JSON.stringify(deviceIds) : null;
  const singleDeviceId = deviceIds.length === 1 ? deviceIds[0] : null;

  db.run(`UPDATE maintenance_records SET device_id = ?, device_ids = ?, technician_id = ?, maintenance_time = ?, content = ?, note = ? WHERE id = ?`,
    [singleDeviceId, deviceIdsJson, technician_id, maintenance_time, content, note || '', id], function (err) {
      if (err) return sendError(res, 500, '更新维修记录失败');
      res.json({ success: true });
    });
});

app.delete('/api/maintenance-records/:id', requireAuth, requirePermission('manage_records'), (req, res) => {
  db.run(`DELETE FROM maintenance_records WHERE id = ?`, [req.params.id], function (err) {
    if (err) return sendError(res, 500, '删除失败');
    res.json({ success: true });
  });
});

app.post('/api/upload-avatar', requireAuth, requirePermission('manage_users'), upload.single('file'), (req, res) => {
  if (!req.file) return sendError(res, 400, '请上传图片文件');
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    fs.unlinkSync(req.file.path);
    return sendError(res, 400, '只支持图片文件（jpg, jpeg, png, gif, webp）');
  }

  const filename = `avatar_${Date.now()}${fileExtension}`;
  const uploadPath = path.join(__dirname, 'public', 'uploads', filename);

  // 确保uploads目录存在
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  fs.copyFileSync(req.file.path, uploadPath);
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    url: `/uploads/${filename}`
  });
});

app.post('/api/upload-background', requireAuth, requirePermission('manage_users'), upload.single('file'), (req, res) => {
  if (!req.file) return sendError(res, 400, '请上传图片文件');
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    fs.unlinkSync(req.file.path);
    return sendError(res, 400, '只支持图片文件（jpg, jpeg, png, gif, webp）');
  }

  const filename = `background_${Date.now()}${fileExtension}`;
  const uploadPath = path.join(__dirname, 'public', 'uploads', filename);

  // 确保uploads目录存在
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  fs.copyFileSync(req.file.path, uploadPath);
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    url: `/uploads/${filename}`
  });
});

app.post('/api/upload-logo', requireAuth, requirePermission('manage_users'), upload.single('file'), (req, res) => {
  if (!req.file) return sendError(res, 400, '请上传图片文件');
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    fs.unlinkSync(req.file.path);
    return sendError(res, 400, '只支持图片文件（jpg, jpeg, png, gif, webp, svg）');
  }

  const filename = `logo_${Date.now()}${fileExtension}`;
  const uploadPath = path.join(__dirname, 'public', 'uploads', filename);

  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  fs.copyFileSync(req.file.path, uploadPath);
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    url: `/uploads/${filename}`
  });
});

app.post('/api/import-devices', requireAuth, requirePermission('import_devices'), upload.single('file'), (req, res) => {
  if (!req.file) return sendError(res, 400, '请上传 CSV 文件');

  // 尝试检测文件编码并正确读取
  let content;
  const buffer = fs.readFileSync(req.file.path);
  fs.unlinkSync(req.file.path);

  // 尝试多种编码，选择最合适的
  const encodings = ['utf8', 'gbk', 'gb18030', 'utf16le'];
  let bestContent = '';
  let bestScore = -1;

  for (const encoding of encodings) {
    try {
      const decoded = iconv.decode(buffer, encoding);
      // 简单评分：检查是否包含常见中文字符
      const chineseCharCount = (decoded.match(/[\u4e00-\u9fa5]/g) || []).length;
      const invalidCharCount = (decoded.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
      const score = chineseCharCount - invalidCharCount * 10;

      if (score > bestScore) {
        bestScore = score;
        bestContent = decoded;
      }
    } catch (e) {
      // 忽略编码错误，继续尝试下一个
    }
  }

  content = bestContent || buffer.toString('utf8');

  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return sendError(res, 400, 'CSV 文件内容为空或格式错误');

  // 简单的CSV解析，处理引号包裹的字段
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headerRow = parseCSVLine(lines.shift());
  const header = headerRow.map((item) => {
    const normalized = item.toLowerCase().replace(/['"]/g, '');
    const map = {
      '名称': 'name',
      '设备名称': 'name',
      '设备类型': 'device_type',
      '类型': 'device_type',
      '品牌': 'brand',
      'ip地址': 'ip_address',
      'ip': 'ip_address',
      '安装位置': 'install_location',
      '所属nvr': 'nvr',
      'nvr': 'nvr',
      '备注': 'note'
    };
    return map[normalized] || normalized;
  });

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  db.run('BEGIN TRANSACTION', (beginErr) => {
    if (beginErr) {
      return sendError(res, 500, '启动事务失败');
    }

    const tasks = lines.map((line) => {
      return new Promise((resolve) => {
        const values = parseCSVLine(line);
        const item = {};
        header.forEach((key, index) => item[key] = values[index] || '');
        item.name = item.name ? item.name.replace(/['"]/g, '').trim() : '';
        item.device_type = item.device_type ? item.device_type.replace(/['"]/g, '').trim() : '';
        item.nvr = item.nvr ? item.nvr.replace(/['"]/g, '').trim() : '';
        item.brand = item.brand ? item.brand.replace(/['"]/g, '').trim() : '';

        if (!item.name || !item.device_type) {
          failCount++;
          errors.push(`跳过空行或缺少必填字段: ${line}`);
          return resolve();
        }

        db.get(`SELECT id FROM device_types WHERE name = ?`, [item.device_type], (err, row) => {
          if (err) {
            failCount++;
            errors.push(`查询设备类型失败: ${item.device_type}`);
            return resolve();
          }
          const typeId = row ? row.id : null;
          if (!typeId) {
            failCount++;
            errors.push(`设备类型不存在: ${item.device_type}`);
            return resolve();
          }

          db.get(`SELECT id FROM brands WHERE name = ?`, [item.brand], (err2, brandRow) => {
            if (err2) {
              failCount++;
              errors.push(`查询品牌失败: ${item.brand}`);
              return resolve();
            }
            if (item.brand && !brandRow) {
              failCount++;
              errors.push(`品牌不存在: ${item.brand}`);
              return resolve();
            }
            const brandId = brandRow ? brandRow.id : null;

            db.get(`SELECT id FROM nvrs WHERE name = ?`, [item.nvr], (err3, nvrRow) => {
              if (err3) {
                failCount++;
                errors.push(`查询NVR失败: ${item.nvr}`);
                return resolve();
              }
              if (item.nvr && !nvrRow) {
                failCount++;
                errors.push(`所属NVR不存在: ${item.nvr}`);
                return resolve();
              }
              const nvrId = nvrRow ? nvrRow.id : null;

              db.run(`INSERT INTO devices (name, device_type_id, brand_id, ip_address, install_location, nvr_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [item.name, typeId, brandId, item.ip_address || '', item.install_location || '', nvrId, item.note || ''], function (err) {
                  if (err) {
                    failCount++;
                    errors.push(`插入设备失败: ${item.name} - ${err.message}`);
                  } else {
                    successCount++;
                  }
                  resolve();
                });
            });
          });
        });
      });
    });

    Promise.all(tasks).then(() => {
      if (failCount > 0) {
        db.run('ROLLBACK', () => {
          const message = `导入失败：成功 ${successCount} 条，失败 ${failCount} 条`;
          if (errors.length <= 10) {
            res.json({ success: false, message, errors });
          } else {
            res.json({ success: false, message, errors: errors.slice(0, 10).concat(['...']) });
          }
        });
      } else {
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            return sendError(res, 500, '提交事务失败');
          }
          res.json({ success: true, message: `导入完成：成功 ${successCount} 条` });
        });
      }
    });
  });
});

app.get('/api/export-devices', requireAuth, requirePermission('export_devices'), (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',').map((item) => Number(item)).filter((value) => Number.isInteger(value) && value > 0) : [];
  let sql = `SELECT devices.name, device_types.name AS device_type, brands.name AS brand, devices.ip_address, devices.install_location, nvrs.name AS nvr, devices.note
    FROM devices
    LEFT JOIN device_types ON devices.device_type_id = device_types.id
    LEFT JOIN brands ON devices.brand_id = brands.id
    LEFT JOIN nvrs ON devices.nvr_id = nvrs.id`;
  const params = [];
  if (ids.length) {
    sql += ` WHERE devices.id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  db.all(sql, params, (err, rows) => {
    if (err) return sendError(res, 500, '导出失败');
    const header = ['设备名称,设备类型,品牌,IP地址,安装位置,所属NVR,备注'];
    const body = rows.map((row) => [row.name, row.device_type || '', row.brand || '', row.ip_address || '', row.install_location || '', row.nvr || '', row.note || ''].map((value) => `"${(value || '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Disposition', 'attachment; filename="device-export.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(header.concat(body).join('\n'));
  });
});

app.get('/api/template/devices', requireAuth, (req, res) => {
  const template = '设备名称,设备类型,品牌,IP地址,安装位置,所属NVR,备注\n示例监控,监控,Hikvision,192.168.1.100,楼道1号,录像机A,定期检查线路';
  res.setHeader('Content-Disposition', 'attachment; filename="device-template.csv"');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(template);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IT 资产台账系统已启动，访问 http://localhost:${PORT}`);
});
