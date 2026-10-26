import nextEnv from '@next/env';
import postgres from 'postgres';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL, {
  prepare: false,
  max: 1,
  ssl: 'require',
});
try {
  const counts = (
    await sql`SELECT (SELECT count(*)::int FROM game.users WHERE demo=0) AS players,(SELECT count(*)::int FROM game.contributions) AS contributions,(SELECT count(*)::int FROM game.alliances WHERE active=1) AS alliances,(SELECT count(*)::int FROM pg_tables WHERE schemaname='game' AND rowsecurity=true) AS protected_tables`
  )[0];
  const storage = (await sql`SELECT public FROM storage.buckets WHERE id='sponsor-logos'`)[0];
  if (!storage || storage.public) throw new Error('Le stockage des logos doit rester privé.');
  await sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL ROLE anon');
    const permitted = (
      await tx`SELECT has_schema_privilege(current_user,'game','USAGE') AS access`
    )[0].access;
    if (permitted) throw new Error('Le schéma privé est accessible au rôle public.');
    const signal = await tx`SELECT revision FROM public.world_events WHERE id=1`;
    if (signal.length !== 1) throw new Error('Signal temps réel indisponible.');
  });
  console.log(
    JSON.stringify({
      ...counts,
      privateLogos: true,
      anonymousGameAccess: false,
      publicRealtimeSignal: true,
    }),
  );
} catch (error) {
  console.error(`Audit interrompu (${error.code || error.message || error.name}).`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
