-- Existing identities, conquests and sponsor balances remain unchanged.
ALTER TABLE game.users ADD COLUMN email TEXT;
ALTER TABLE game.users ADD COLUMN email_key TEXT;
ALTER TABLE game.users ADD COLUMN email_verified_at BIGINT;
CREATE UNIQUE INDEX users_email_key_unique ON game.users(email_key) WHERE email_key IS NOT NULL;
CREATE TABLE game.email_challenges (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, email_key TEXT NOT NULL,
  user_id TEXT REFERENCES game.users(id) ON DELETE CASCADE,
  username TEXT, password TEXT, color TEXT, code_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, attempts BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX email_challenges_expiry ON game.email_challenges(expires_at);
ALTER TABLE game.email_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON game.email_challenges FROM PUBLIC, anon, authenticated;
