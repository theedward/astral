CREATE TABLE pairs (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, label TEXT NOT NULL, state_hash TEXT UNIQUE, expires INTEGER NOT NULL, user_id TEXT, sealed_token TEXT);
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE profiles (user_id TEXT NOT NULL REFERENCES users(id), flavor TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, snapshot_id TEXT, hash TEXT, updated TEXT, PRIMARY KEY(user_id, flavor));
CREATE TABLE snapshots (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, flavor TEXT NOT NULL, revision INTEGER NOT NULL, created TEXT NOT NULL);
CREATE INDEX snapshots_user ON snapshots(user_id, flavor, revision DESC);
CREATE TABLE chunks (snapshot_id TEXT NOT NULL, position INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(snapshot_id, position));
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
