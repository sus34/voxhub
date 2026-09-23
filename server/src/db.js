import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * One SQLite file holds everything, so a backup is a copy of that file.
 *
 * Every table carries `space_id`. In 1.0 a server has exactly one space (one
 * group of friends), but a hosted version would put many on one server — and
 * then only space registration has to be added, not a data migration.
 */

// Append-only: each entry runs once, in order, and bumps user_version.
const MIGRATIONS = [
  `
  CREATE TABLE spaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    space_id      TEXT NOT NULL REFERENCES spaces(id),
    name          TEXT NOT NULL,
    name_key      TEXT NOT NULL,            -- lower-cased, for unique logins
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    banned_at     INTEGER,
    created_at    INTEGER NOT NULL,
    UNIQUE (space_id, name_key)
  );

  CREATE TABLE sessions (
    token_hash    TEXT PRIMARY KEY,         -- sha256 of the cookie value
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_id      TEXT NOT NULL REFERENCES spaces(id),
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE invites (
    code          TEXT PRIMARY KEY,
    space_id      TEXT NOT NULL REFERENCES spaces(id),
    created_by    TEXT NOT NULL REFERENCES users(id),
    max_uses      INTEGER,                  -- NULL = unlimited
    uses          INTEGER NOT NULL DEFAULT 0,
    expires_at    INTEGER,                  -- NULL = never
    revoked_at    INTEGER,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE channels (
    id            TEXT PRIMARY KEY,         -- also the LiveKit room name
    space_id      TEXT NOT NULL REFERENCES spaces(id),
    name          TEXT NOT NULL,
    position      INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    UNIQUE (space_id, name)
  );
  `,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
