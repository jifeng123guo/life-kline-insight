import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'lifekline.db');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式以提高并发性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
const initDatabase = () => {
    // 用户表
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      points INTEGER DEFAULT 1000,
      role TEXT DEFAULT 'user',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      last_login_at TEXT,
      login_count INTEGER DEFAULT 0
    )
  `);

    // 分析结果表
    db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      cost INTEGER DEFAULT 0,
      bazi_json TEXT, -- 存储八字结构
      chart_data TEXT, -- 存储K线数据
      analysis_data TEXT, -- 存储分析文本
      created_at TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    console.log('✓ 数据库初始化完成');
};

initDatabase();

// ============ 用户操作 ============

export const createUser = (id, email, passwordHash, points = 1000) => {
    const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, points, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
    const now = new Date().toISOString();
    stmt.run(id, email, passwordHash, points, now);
    return { id, email, points, createdAt: now };
};

export const getUserByEmail = (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email);
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        points: row.points,
        role: row.role,
        createdAt: row.created_at,
    };
};

export const getUserById = (id) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        points: row.points,
        role: row.role,
        createdAt: row.created_at,
    };
};

export const updateUserPoints = (userId, newPoints) => {
    const stmt = db.prepare('UPDATE users SET points = ?, updated_at = ? WHERE id = ?');
    stmt.run(newPoints, new Date().toISOString(), userId);
};

export const updateUserLogin = (userId) => {
    const stmt = db.prepare(`
    UPDATE users
    SET last_login_at = ?, login_count = login_count + 1, updated_at = ?
    WHERE id = ?
  `);
    const now = new Date().toISOString();
    stmt.run(now, now, userId);
};

// ============ 分析结果 ============

export const saveAnalysis = (data) => {
    const stmt = db.prepare(`
    INSERT INTO analyses (
      id, user_id, cost, bazi_json, chart_data, analysis_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const now = new Date().toISOString();
    stmt.run(
        data.id,
        data.userId,
        data.cost || 0,
        JSON.stringify(data.bazi || []),
        JSON.stringify(data.chartData || []),
        JSON.stringify(data.analysisData || {}),
        now
    );
    return { ...data, createdAt: now };
};

export const getAnalysesByUserId = (userId, limit = 20, offset = 0) => {
    const stmt = db.prepare(`
    SELECT * FROM analyses
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
    return stmt.all(userId, limit, offset).map(row => ({
        id: row.id,
        userId: row.user_id,
        cost: row.cost,
        bazi: JSON.parse(row.bazi_json || '[]'),
        chartData: JSON.parse(row.chart_data || '[]'),
        analysisData: JSON.parse(row.analysis_data || '{}'),
        createdAt: row.created_at,
    }));
};

export const deleteAnalysis = (id, userId) => {
    const stmt = db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?');
    stmt.run(id, userId);
};
