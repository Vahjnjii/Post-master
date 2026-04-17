import Database from 'better-sqlite3';
import { join } from 'path';

// This file mimics the Cloudflare D1 interface using local SQLite
const dbPath = join(process.cwd(), 'data.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    email TEXT,
    displayName TEXT,
    photoURL TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    userId TEXT,
    title TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    sharedCount INTEGER DEFAULT 0,
    downloadedCount INTEGER DEFAULT 0,
    FOREIGN KEY(userId) REFERENCES users(uid)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT,
    userId TEXT,
    role TEXT,
    content TEXT,
    postPlaceholders TEXT, -- JSON string
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chatId) REFERENCES chats(id),
    FOREIGN KEY(userId) REFERENCES users(uid)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    userId TEXT,
    chatId TEXT,
    messageId TEXT,
    title TEXT,
    content TEXT, -- JSON string
    hashtags TEXT, -- JSON string
    languageName TEXT,
    imageData TEXT,
    interacted BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chatId) REFERENCES chats(id),
    FOREIGN KEY(messageId) REFERENCES messages(id),
    FOREIGN KEY(userId) REFERENCES users(uid)
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    userId TEXT,
    keyLabel TEXT,
    apiKey TEXT,
    quotaExhausted BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(uid)
  );
`);

export default db;
