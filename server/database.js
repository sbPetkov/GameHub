const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function openDb() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return open({
    filename: path.join(dataDir, 'gamehub.db'),
    driver: sqlite3.Database
  });
}

async function initDb() {
  const db = await openDb();
  // Create Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      username TEXT,
      games_played INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0
    )
  `);
  return db;
}

module.exports = { openDb, initDb };
