CREATE TABLE game.admin_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES game.users(id),
  season_id BIGINT NOT NULL REFERENCES game.seasons(id),
  created_at BIGINT NOT NULL
);
ALTER TABLE game.admin_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON game.admin_resets FROM PUBLIC, anon, authenticated;
