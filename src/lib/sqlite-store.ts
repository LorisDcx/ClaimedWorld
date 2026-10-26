import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SEASON_LENGTH, STOCK_CAP } from './rules';
import { hashPassword } from './password';
type Row = Record<string, string | number | null>;
let connection: DatabaseSync;
let transactionDepth = 0;
export function database(): DatabaseSync {
  if (connection) return connection;
  const location = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'claimed.sqlite');
  if (location !== ':memory:') mkdirSync(path.dirname(location), { recursive: true });
  connection = new DatabaseSync(location);
  // Detect an existing game through SQLite itself: the runtime database is not
  // a build asset and must never cause the workspace to be bundled by tracing.
  const existing =
    location !== ':memory:' &&
    !!connection
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL,
      wallet INTEGER NOT NULL DEFAULT 100 CHECK(wallet >= 0), collected_slots INTEGER NOT NULL DEFAULT 0,
      generation_anchor INTEGER NOT NULL, alliance_id TEXT, cooldown_until INTEGER NOT NULL DEFAULT 0,
      banned INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0, alliance_role TEXT NOT NULL DEFAULT 'member'
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, archived_at INTEGER, snapshot TEXT);
    CREATE TABLE IF NOT EXISTS alliances (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, color TEXT NOT NULL, emblem TEXT NOT NULL, description TEXT NOT NULL, leader_id TEXT NOT NULL REFERENCES users(id), invite TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS contributions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), camp_id TEXT NOT NULL, country_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, season_id INTEGER NOT NULL REFERENCES seasons(id));
    CREATE INDEX IF NOT EXISTS contribution_active ON contributions(season_id, country_id, expires_at);
    CREATE TABLE IF NOT EXISTS ownership (country_id TEXT NOT NULL, season_id INTEGER NOT NULL, camp_id TEXT, changes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(country_id, season_id));
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, color TEXT NOT NULL, created_at INTEGER NOT NULL, country_id TEXT, season_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sponsors (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), country_id TEXT NOT NULL, season_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL, initials TEXT NOT NULL, color TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_status TEXT NOT NULL DEFAULT 'unpaid', checkout_id TEXT, checkout_expires INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), target TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_resets (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),season_id INTEGER NOT NULL REFERENCES seasons(id),created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS alliance_memberships (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE, joined_at INTEGER NOT NULL, left_at INTEGER);
    CREATE TABLE IF NOT EXISTS alliance_ledger (id TEXT PRIMARY KEY, alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, season_id INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0), country_id TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS treasury_lots (id TEXT PRIMARY KEY, alliance_id TEXT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, season_id INTEGER NOT NULL, amount INTEGER NOT NULL, remaining INTEGER NOT NULL CHECK(remaining >= 0), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contribution_funding (contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, amount INTEGER NOT NULL CHECK(amount > 0), PRIMARY KEY(contribution_id,user_id));
    CREATE TABLE IF NOT EXISTS ownership_periods (id INTEGER PRIMARY KEY, country_id TEXT NOT NULL, season_id INTEGER NOT NULL, camp_id TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER);
    CREATE INDEX IF NOT EXISTS ownership_period_season ON ownership_periods(season_id,country_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ownership_period_open ON ownership_periods(season_id,country_id) WHERE ends_at IS NULL;
    CREATE INDEX IF NOT EXISTS treasury_lot_pending ON treasury_lots(alliance_id,season_id,created_at) WHERE remaining>0;
    CREATE INDEX IF NOT EXISTS treasury_log_recent ON alliance_ledger(alliance_id,season_id,created_at);
    CREATE TABLE IF NOT EXISTS season_rewards (season_id INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_season INTEGER NOT NULL, capacity_bonus INTEGER NOT NULL, rate_bonus INTEGER NOT NULL, starting_influence INTEGER NOT NULL, metrics TEXT NOT NULL, PRIMARY KEY(season_id,user_id));
    CREATE TABLE IF NOT EXISTS sponsor_wallets (user_id TEXT PRIMARY KEY REFERENCES users(id), balance_cents INTEGER NOT NULL DEFAULT 0 CHECK(balance_cents>=0), debt_cents INTEGER NOT NULL DEFAULT 0 CHECK(debt_cents>=0), frozen INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sponsor_topups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>=500), status TEXT NOT NULL DEFAULT 'pending', checkout_id TEXT UNIQUE, payment_intent TEXT UNIQUE, checkout_expires INTEGER, credited_at INTEGER, refunded_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE(user_id,request_id));
    CREATE TABLE IF NOT EXISTS sponsor_stakes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), campaign_id TEXT NOT NULL REFERENCES sponsors(id), country_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), placed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, changed_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', origin_id TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsor_stakes_active ON sponsor_stakes(country_id,expires_at) WHERE status='active';
    CREATE INDEX IF NOT EXISTS sponsor_stakes_user ON sponsor_stakes(user_id,status,expires_at);
    CREATE TABLE IF NOT EXISTS sponsor_ownership (country_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, changed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sponsor_clock (id INTEGER PRIMARY KEY CHECK(id=1), processed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sponsor_disputes (payment_intent TEXT PRIMARY KEY, event_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sponsor_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, wallet_delta INTEGER NOT NULL DEFAULT 0, from_country TEXT, to_country TEXT, stake_id TEXT, topup_id TEXT, created_at INTEGER NOT NULL);
  `);
  if (!all<{ name: string }>('PRAGMA table_info(sponsors)').some((c) => c.name === 'logo_id'))
    connection.exec('ALTER TABLE sponsors ADD COLUMN logo_id TEXT REFERENCES uploads(id)');
  if (!all<{ name: string }>('PRAGMA table_info(users)').some((c) => c.name === 'is_admin'))
    connection.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  if (!all<{ name: string }>('PRAGMA table_info(seasons)').some((c) => c.name === 'processed_at'))
    connection.exec('ALTER TABLE seasons ADD COLUMN processed_at INTEGER NOT NULL DEFAULT 0');
  if (
    !all<{ name: string }>('PRAGMA table_info(users)').some((c) => c.name === 'alliance_joined_at')
  )
    connection.exec('ALTER TABLE users ADD COLUMN alliance_joined_at INTEGER NOT NULL DEFAULT 0');
  if (!get('SELECT id FROM schema_migrations WHERE id=?', 'alliance-economy-v2')) {
    if (existing) {
      const folder = path.join(path.dirname(location), 'backups');
      mkdirSync(folder, { recursive: true });
      connection
        .prepare('VACUUM INTO ?')
        .run(path.join(folder, `before-alliance-economy-${Date.now()}.sqlite`));
    }
    transaction(() => {
      const now = Date.now();
      connection.exec(`ALTER TABLE users ADD COLUMN capacity_bonus INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN rate_bonus INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN reward_season INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE alliances ADD COLUMN treasury INTEGER NOT NULL DEFAULT 0 CHECK(treasury >= 0);
        ALTER TABLE alliances ADD COLUMN objective TEXT NOT NULL DEFAULT '';
        ALTER TABLE alliances ADD COLUMN target_ids TEXT NOT NULL DEFAULT '[]';`);
      run(
        'UPDATE users SET wallet=MIN(wallet,?),generation_anchor=?,collected_slots=0',
        STOCK_CAP,
        now,
      );
      run("UPDATE users SET alliance_role='general' WHERE alliance_role='coleader'");
      run(
        'INSERT INTO alliance_memberships(user_id,alliance_id,joined_at) SELECT id,alliance_id,MAX(created_at,alliance_joined_at) FROM users WHERE alliance_id IS NOT NULL',
      );
      run(
        'INSERT INTO ownership_periods(country_id,season_id,camp_id,starts_at) SELECT country_id,season_id,camp_id,? FROM ownership WHERE camp_id IS NOT NULL',
        now,
      );
      run('INSERT INTO schema_migrations VALUES(?,?)', 'alliance-economy-v2', now);
    });
  }
  removeDemoFixtures();
  if (!get('SELECT id FROM seasons LIMIT 1')) seed();
  if (!get('SELECT id FROM schema_migrations WHERE id=?', 'sponsor-auctions-v1')) {
    if (existing) {
      const folder = path.join(path.dirname(location), 'backups');
      mkdirSync(folder, { recursive: true });
      connection
        .prepare('VACUUM INTO ?')
        .run(path.join(folder, `before-sponsor-auctions-${Date.now()}.sqlite`));
    }
    transaction(() => {
      connection.exec('DROP INDEX IF EXISTS sponsor_exclusive');
      const now = Date.now();
      // Existing paid placements retain their old end date. They receive no
      // invented extra money or additional month when changing auction models.
      for (const old of all<{
        id: string;
        user_id: string;
        country_id: string;
        amount: number;
        ends_at: number;
        created_at: number;
      }>(
        "SELECT s.id,s.user_id,s.country_id,s.amount,s.created_at,se.ends_at FROM sponsors s JOIN seasons se ON se.id=s.season_id WHERE s.payment_status='paid' AND s.status='approved' AND se.ends_at>?",
        now,
      )) {
        const stakeId = randomUUID();
        run(
          'INSERT INTO sponsor_stakes VALUES(?,?,?,?,?,?,?,?,?,?)',
          stakeId,
          old.user_id,
          old.id,
          old.country_id,
          old.amount,
          old.created_at,
          Math.min(old.ends_at, now + 30 * 86400000),
          now,
          'active',
          stakeId,
        );
      }
      run('INSERT OR REPLACE INTO sponsor_clock VALUES(1,?)', now);
      run('INSERT INTO schema_migrations VALUES(?,?)', 'sponsor-auctions-v1', now);
    });
  }
  if (!get('SELECT id FROM schema_migrations WHERE id=?', 'border-attacks-v1')) {
    if (existing) {
      mkdirSync(path.join(path.dirname(location), 'backups'), { recursive: true });
      connection
        .prepare('VACUUM INTO ?')
        .run(
          path.join(
            path.dirname(location),
            'backups',
            `before-border-attacks-${Date.now()}.sqlite`,
          ),
        );
    }
    transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS battle_orders (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,source_id TEXT NOT NULL,destination_id TEXT NOT NULL,target_camp TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),mode TEXT NOT NULL,destroyed INTEGER NOT NULL,survivors INTEGER NOT NULL,created_at INTEGER NOT NULL,season_id INTEGER NOT NULL REFERENCES seasons(id),UNIQUE(user_id,request_id));
        CREATE TABLE IF NOT EXISTS influence_burns (id TEXT PRIMARY KEY,contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,attack_id TEXT NOT NULL REFERENCES battle_orders(id),amount INTEGER NOT NULL CHECK(amount>0),created_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS influence_burn_lookup ON influence_burns(contribution_id,created_at);
        CREATE TABLE IF NOT EXISTS influence_transfers (contribution_id TEXT PRIMARY KEY REFERENCES contributions(id) ON DELETE CASCADE,source_id TEXT NOT NULL REFERENCES contributions(id),attack_id TEXT NOT NULL REFERENCES battle_orders(id));
      `);
      run('INSERT INTO schema_migrations VALUES(?,?)', 'border-attacks-v1', Date.now());
    });
  }
  if (!get('SELECT id FROM schema_migrations WHERE id=?', 'progression-v1')) {
    if (existing) {
      mkdirSync(path.join(path.dirname(location), 'backups'), { recursive: true });
      connection
        .prepare('VACUUM INTO ?')
        .run(
          path.join(path.dirname(location), 'backups', `before-progression-${Date.now()}.sqlite`),
        );
    }
    transaction(() => {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS progression_unlocks (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,unlocked_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));
        CREATE TABLE IF NOT EXISTS player_progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,frame TEXT NOT NULL DEFAULT 'frame-none',title TEXT NOT NULL DEFAULT 'title-none',border TEXT NOT NULL DEFAULT 'border-solid',tutorial_step INTEGER NOT NULL DEFAULT 0,tutorial_dismissed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS player_objectives (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,objective_id TEXT NOT NULL,season_id INTEGER NOT NULL REFERENCES seasons(id),started_at INTEGER NOT NULL);
      `);
      run('INSERT INTO schema_migrations VALUES(?,?)', 'progression-v1', Date.now());
    });
  }
  // Older app versions created this index on startup; auctions allow several
  // approved advertisers to compete for the same country.
  connection.exec('DROP INDEX IF EXISTS sponsor_exclusive');
  // Only a new, explicitly provisioned account receives the persisted admin role.
  // A public signup or username change can never grant this role.
  const adminName = process.env.ADMIN_USERNAME,
    adminPassword = process.env.ADMIN_PASSWORD;
  if (
    adminName &&
    adminPassword &&
    adminPassword.length >= 12 &&
    !get('SELECT id FROM users WHERE username=?', adminName)
  ) {
    const now = Date.now();
    run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor,is_admin) VALUES(?,?,?,?,?,?,1)',
      randomUUID(),
      adminName,
      hashPassword(adminPassword),
      '#ff5d35',
      now,
      now,
    );
  }
  return connection;
}
export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return database()
    .prepare(sql)
    .get(...params) as T | undefined;
}
export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return database()
    .prepare(sql)
    .all(...params) as T[];
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(fn: () => T): T {
  const db = database();
  const nested = transactionDepth > 0;
  const point = `nested_${transactionDepth}`;
  db.exec(nested ? `SAVEPOINT ${point}` : 'BEGIN IMMEDIATE');
  transactionDepth++;
  try {
    const result = fn();
    db.exec(nested ? `RELEASE SAVEPOINT ${point}` : 'COMMIT');
    return result;
  } catch (error) {
    db.exec(nested ? `ROLLBACK TO SAVEPOINT ${point}` : 'ROLLBACK');
    if (nested) db.exec(`RELEASE SAVEPOINT ${point}`);
    throw error;
  } finally {
    transactionDepth--;
  }
}
export function log(
  text: string,
  color: string,
  country: string | null,
  season: number,
  now = Date.now(),
) {
  run(
    'INSERT INTO activity(text,color,created_at,country_id,season_id) VALUES(?,?,?,?,?)',
    text,
    color,
    now,
    country,
    season,
  );
}
// Remove only records introduced by the former demo seed, including their visible history.
export function removeDemoFixtures() {
  const demos = all<{ id: string }>('SELECT id FROM users WHERE demo=1');
  if (!demos.length) return;
  transaction(() => {
    const ids = demos.map((u) => u.id),
      marks = ids.map(() => '?').join(',');
    const alliances = all<{ id: string; name: string }>(
      `SELECT id,name FROM alliances WHERE leader_id IN (${marks})`,
      ...ids,
    );
    for (const alliance of alliances) {
      run(
        "UPDATE users SET alliance_id=NULL,alliance_role='member',cooldown_until=0 WHERE alliance_id=?",
        alliance.id,
      );
      run('DELETE FROM contributions WHERE camp_id=?', alliance.id);
      run('DELETE FROM ownership WHERE camp_id=?', alliance.id);
      run('DELETE FROM activity WHERE text LIKE ?', `${alliance.name} %`);
      run('DELETE FROM alliances WHERE id=?', alliance.id);
    }
    run(`DELETE FROM contributions WHERE user_id IN (${marks})`, ...ids);
    run(`DELETE FROM ownership WHERE camp_id IN (${marks})`, ...ids);
    run(`DELETE FROM users WHERE id IN (${marks})`, ...ids);
  });
}
function seed() {
  const now = Date.now();
  transaction(() => {
    if (get('SELECT id FROM seasons LIMIT 1')) return;
    run('INSERT INTO seasons(id,starts_at,ends_at) VALUES(1,?,?)', now, now + SEASON_LENGTH);
    log('La saison 01 est ouverte. Le monde vous attend.', '#111111', null, 1, now);
  });
}
