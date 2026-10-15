// One SQLite file holds accounts, sessions, wardrobes and photos, so a backup is
// a single consistent copy (see `node cli.mjs backup`). node:sqlite is built into
// Node 22.13+ and is synchronous: each request's reads and writes run without
// interleaving, and multi-statement changes use an explicit transaction.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 2;

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    -- Deleted rows (an account removed on request) are overwritten, not left in free pages.
    PRAGMA secure_delete = ON;
  `);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > SCHEMA_VERSION) throw new Error(`이 서버보다 새 버전의 데이터베이스예요 (${version}).`);
  if (version < 1) {
    transaction(db, () => {
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          agreement_version TEXT NOT NULL,
          agreed_at INTEGER NOT NULL
        );
        -- One row per sign-in method. Only 'email' is enabled now; a later
        -- 'kakao' or 'google' row links to the same user without a schema change.
        CREATE TABLE identities (
          provider TEXT NOT NULL,
          subject TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          email TEXT,
          password_hash TEXT,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (provider, subject)
        );
        CREATE INDEX identities_user ON identities(user_id);
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX sessions_user ON sessions(user_id);
        CREATE TABLE wardrobes (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          state TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE photos (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          bytes BLOB NOT NULL,
          size INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        PRAGMA user_version = 1;
      `);
    });
  }
  if (version < 2) {
    transaction(db, () => {
      db.exec(`
        -- When the email of a sign-in was proven by a one-time link.
        ALTER TABLE identities ADD COLUMN verified_at INTEGER;
        -- One-time links for email verification and password reset. Only the
        -- SHA-256 of the token is stored; each link works once and expires.
        CREATE TABLE email_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
          email TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          used_at INTEGER
        );
        CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);
        PRAGMA user_version = 2;
      `);
    });
  }
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** A consistent copy of a live database, including uncommitted WAL pages. */
export function backupDatabase(db, target) {
  if (fs.existsSync(target)) throw new Error(`이미 있는 파일에는 덮어쓰지 않아요: ${target}`);
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  db.prepare('VACUUM INTO ?').run(path.resolve(target));
}
