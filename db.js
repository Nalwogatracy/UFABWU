require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Choose the database backend:
//  - If TURSO_URL is set, use Turso (cloud SQLite, used on Vercel / production).
//  - Otherwise use the local SQLite file (used for local development).
const isTurso = !!process.env.TURSO_URL;

let localDb = null; // node:sqlite DatabaseSync
let turso = null;   // @libsql/client

if (isTurso) {
  const { createClient } = require('@libsql/client');
  turso = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined
  });
} else {
  const { DatabaseSync } = require('node:sqlite');
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  localDb = new DatabaseSync(path.join(dataDir, 'ufabwu.db'));
  localDb.exec('PRAGMA journal_mode = WAL');
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    sector TEXT,
    subscribed_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS grievances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    employer TEXT,
    category TEXT,
    district TEXT,
    details TEXT,
    status TEXT DEFAULT 'Assigned to Legal Department',
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    nin TEXT,
    phone TEXT,
    sector TEXT,
    employer TEXT,
    branch TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`
];

async function init() {
  if (isTurso) {
    for (const stmt of SCHEMA_STATEMENTS) {
      await turso.execute(stmt);
    }
  } else {
    for (const stmt of SCHEMA_STATEMENTS) {
      localDb.exec(stmt);
    }
  }
}

// run() -> { changes }   (rows affected)
async function run(sql, params = []) {
  if (isTurso) {
    const result = await turso.execute(sql, params);
    return { changes: result.rowsAffected };
  }
  const result = localDb.prepare(sql).run(...params);
  return { changes: Number(result.changes || 0) };
}

// get() -> first row or undefined
async function get(sql, params = []) {
  if (isTurso) {
    const result = await turso.execute(sql, params);
    return result.rows[0];
  }
  return localDb.prepare(sql).get(...params);
}

module.exports = { init, run, get, isTurso };
