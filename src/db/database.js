const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

// Ensure data directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open / create SQLite database
const db = new DatabaseSync(config.dbPath);

// Enable Foreign Keys and WAL mode for reliability and performance
try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  console.warn('Note on pragma execution:', e.message);
}

// Initialize tables from schema.sql
function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
  console.log(`[DB] Database initialized at: ${config.dbPath}`);
}

module.exports = {
  db,
  initDatabase
};
