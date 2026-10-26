import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import type { SQLInputValue } from 'node:sqlite';

type Row = Record<string, string | number | null>;
export const usesPostgres = () => {
  const configured = !!(
    context.getStore()?.executor ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL
  );
  if (process.env.VERCEL === '1' && !configured)
    throw new Error('Le stockage PostgreSQL doit être configuré sur Vercel.');
  return configured;
};
function makeClient() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL est requis pour le déploiement.');
  return postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: 'require',
    types: {
      bigint: { to: 20, from: [20], serialize: (v: number) => String(v), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: Number },
    },
  });
}
type Client = ReturnType<typeof makeClient>;
type Executor = Pick<Client, 'unsafe'>;
let client: Client | undefined;
const context = new AsyncLocalStorage<{ executor?: Executor; depth: number }>();
let localQueue: Promise<unknown> = Promise.resolve();

const tables = new Set([
  'users',
  'sessions',
  'seasons',
  'alliances',
  'contributions',
  'ownership',
  'activity',
  'sponsors',
  'webhook_events',
  'reports',
  'rate_limits',
  'uploads',
  'schema_migrations',
  'admin_resets',
  'alliance_memberships',
  'alliance_ledger',
  'treasury_lots',
  'contribution_funding',
  'ownership_periods',
  'season_rewards',
  'sponsor_wallets',
  'sponsor_topups',
  'sponsor_stakes',
  'sponsor_ownership',
  'sponsor_clock',
  'sponsor_disputes',
  'sponsor_ledger',
  'battle_orders',
  'influence_burns',
  'influence_transfers',
  'progression_unlocks',
  'player_progress',
  'player_objectives',
  'world_cache',
]);

export function postgresQuery(source: string) {
  let statement = source
    .replace(/\bINSERT OR IGNORE INTO\b/gi, 'INSERT INTO')
    .replace(/\bAS\s+([a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g, 'AS "$1"');
  const ignore = /\bINSERT OR IGNORE INTO\b/i.test(source);
  if (/INSERT OR REPLACE INTO sponsor_clock/i.test(statement))
    statement =
      statement.replace(/INSERT OR REPLACE INTO/i, 'INSERT INTO') +
      ' ON CONFLICT(id) DO UPDATE SET processed_at=excluded.processed_at';
  let result = '',
    parameter = 0;
  for (let i = 0; i < statement.length;) {
    const char = statement[i];
    if (char === "'" || char === '"') {
      const quote = char,
        start = i++;
      while (i < statement.length) {
        if (statement[i++] === quote) {
          if (statement[i] === quote) i++;
          else break;
        }
      }
      result += statement.slice(start, i);
    } else if (char === '?') {
      result += `$${++parameter}`;
      i++;
    } else if (/[a-zA-Z_]/.test(char)) {
      const start = i++;
      while (i < statement.length && /[a-zA-Z_0-9]/.test(statement[i])) i++;
      const word = statement.slice(start, i);
      if (tables.has(word.toLowerCase()) && statement[start - 1] !== '.') result += `game.${word}`;
      else if (/^(MAX|MIN)$/i.test(word) && statement.slice(i).match(/^\s*\(/)) {
        let depth = 0,
          multiple = false,
          quoted = false;
        for (let j = statement.indexOf('(', i); j < statement.length; j++) {
          if (statement[j] === "'") quoted = !quoted;
          if (quoted) continue;
          if (statement[j] === '(') depth++;
          else if (statement[j] === ')' && --depth === 0) break;
          else if (statement[j] === ',' && depth === 1) multiple = true;
        }
        result += multiple ? (word.toUpperCase() === 'MAX' ? 'GREATEST' : 'LEAST') : word;
      } else result += word;
    } else {
      result += char;
      i++;
    }
  }
  return ignore ? `${result} ON CONFLICT DO NOTHING` : result;
}

async function local<T>(fn: () => Promise<T> | T) {
  if (context.getStore()) return fn();
  const pending = localQueue.then(fn, fn);
  localQueue = pending.catch(() => {});
  return pending;
}
async function query<T>(sql: string, params: SQLInputValue[]): Promise<T[]> {
  const executor = context.getStore()?.executor || (client ??= makeClient());
  return (await executor.unsafe(
    postgresQuery(sql),
    params as Parameters<Executor['unsafe']>[1],
  )) as unknown as T[];
}
export async function get<T = Row>(
  sql: string,
  ...params: SQLInputValue[]
): Promise<T | undefined> {
  if (usesPostgres()) return (await query<T>(sql, params))[0];
  return local(async () => (await import('./sqlite-store')).get<T>(sql, ...params));
}
export async function all<T = Row>(sql: string, ...params: SQLInputValue[]): Promise<T[]> {
  if (usesPostgres()) return query<T>(sql, params);
  return local(async () => (await import('./sqlite-store')).all<T>(sql, ...params));
}
export async function run(sql: string, ...params: SQLInputValue[]): Promise<{ changes: number }> {
  if (usesPostgres()) {
    const executor = context.getStore()?.executor || (client ??= makeClient());
    const result = await executor.unsafe(
      postgresQuery(sql),
      params as Parameters<Executor['unsafe']>[1],
    );
    return { changes: result.count };
  }
  return local(async () => ({
    changes: Number((await import('./sqlite-store')).run(sql, ...params).changes),
  }));
}

// The WASM PostgreSQL contract tests exercise the actual domain engine without
// credentials, a cloud account or changes to the production database.
export function withTestDatabase<T>(executor: Executor, fn: () => Promise<T>) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test driver unavailable outside tests.');
  return context.run({ executor, depth: 0 }, fn);
}
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  const parent = context.getStore();
  if (usesPostgres()) {
    if (parent?.executor) return fn();
    client ??= makeClient();
    return client.begin(async (executor) => {
      // Serialize state-changing game transactions, including season rollover.
      await executor.unsafe('SELECT pg_advisory_xact_lock(48923101)');
      return context.run({ executor, depth: 0 }, fn);
    }) as Promise<T>;
  }
  return local(async () => {
    const { database } = await import('./sqlite-store');
    const db = database(),
      point = `async_${parent?.depth || 0}`;
    db.exec(parent ? `SAVEPOINT ${point}` : 'BEGIN IMMEDIATE');
    try {
      const value = await context.run({ depth: (parent?.depth || 0) + 1 }, fn);
      db.exec(parent ? `RELEASE SAVEPOINT ${point}` : 'COMMIT');
      return value;
    } catch (error) {
      db.exec(parent ? `ROLLBACK TO SAVEPOINT ${point}` : 'ROLLBACK');
      if (parent) db.exec(`RELEASE SAVEPOINT ${point}`);
      throw error;
    }
  });
}
