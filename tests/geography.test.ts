import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoContains } from 'd3-geo';
import { loadGeography } from '../scripts/geography.mjs';
import countries from '../src/data/countries.json';
import { currentSeason, run, territories } from '../src/lib/db';
import { placeSponsorFunds } from '../src/lib/sponsoring';
process.env.DATABASE_PATH = ':memory:';

test('overseas geometries are separate from metropolitan France and continental USA', () => {
  const features = loadGeography().features;
  const france = features.find((f) => f.id === '250')!;
  const mainlandUSA = features.find((f) => f.id === '840')!;
  assert.ok(geoContains(france, [2.35, 48.85]));
  for (const [id, point] of [
    ['638', [55.53, -21.13]],
    ['474', [-61.02, 14.65]],
    ['312', [-61.68, 16.16]],
  ] as const) {
    assert.ok(
      geoContains(
        features.find((f) => f.id === id)!,
        [...point],
      ),
      id,
    );
    assert.equal(geoContains(france, [...point]), false, id);
    assert.match(countries.find((c) => c.id === id)!.name, /\/ France$/);
  }
  assert.ok(geoContains(mainlandUSA, [-100, 40]));
  assert.equal(geoContains(mainlandUSA, [-155.5, 19.6]), false);
  assert.equal(geoContains(mainlandUSA, [-150, 64]), false);
  assert.equal(new Set(countries.map((c) => c.id)).size, countries.length);
  assert.ok(
    countries.every((c) => c.area >= 0 && c.area < 2 * Math.PI),
    'no tiny ring can become a filled world-sized polygon',
  );
});

test('Pacific archipelagos and named US islands have geometry and usable small-island markers', () => {
  for (const id of [
    '548',
    '090',
    '584',
    '583',
    '296',
    '798',
    '585',
    '520',
    'us-hi',
    'us-ak',
    'ne-mqi',
    'ne-jqi',
    'ne-wqi',
  ]) {
    const c = countries.find((c) => c.id === id);
    assert.ok(c, id);
    assert.ok(c.path.length > 30, id);
    assert.ok(c.center.every(Number.isFinite), id);
    assert.ok(c.anchors.length <= 1, `only one possible marker for ${id}`);
  }
  const kiribati = countries.find((c) => c.id === '296')!;
  assert.ok(
    kiribati.center[0] < 150,
    'dateline-spanning Kiribati focuses on its islands, not the Atlantic',
  );
  assert.equal(
    countries.find((c) => c.id === '076')!.anchors.length,
    0,
    'no added dots for Brazilian islets',
  );
  assert.ok(
    countries.filter((c) => c.overviewMarker).length <= 8,
    'the world overview stays sparse',
  );
  assert.equal(
    countries.find((c) => c.id === '584')!.anchors.length,
    1,
    'one marker for the Marshall Islands archipelago',
  );
});

test('French overseas conquests and advertising slots are independent', () => {
  const s = currentSeason();
  const at = s.starts_at + 1000;
  run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    'geo-player',
    'GeoPlayer',
    '!',
    '#111111',
    at,
    at,
  );
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'geo-fr',
    'geo-player',
    'geo-player',
    '250',
    100,
    at,
    at + 3600000,
    s.id,
  );
  run(
    `INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,payment_status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    'geo-ad',
    'geo-player',
    '250',
    s.id,
    'Geo',
    'Test',
    'https://example.com',
    'G',
    '#111111',
    100,
    'approved',
    'paid',
    at,
  );
  run('INSERT INTO sponsor_wallets(user_id,balance_cents) VALUES(?,?)', 'geo-player', 1000);
  placeSponsorFunds('geo-player', 'geo-ad', '250', 1000, true, at);
  const world = territories(s.id, at);
  assert.equal(world.find((t) => t.id === '250')!.owner?.id, 'geo-player');
  assert.equal(world.find((t) => t.id === '250')!.sponsor?.id, 'geo-ad');
  for (const id of ['638', '474', '312', '254']) {
    const territory = world.find((t) => t.id === id)!;
    assert.equal(territory.owner, null, id);
    assert.equal(territory.sponsor, null, id);
    assert.equal(territory.sponsorReserved, false, id);
  }
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'geo-re',
    'geo-player',
    'geo-player',
    '638',
    50,
    at,
    at + 3600000,
    s.id,
  );
  const updated = territories(s.id, at);
  assert.equal(updated.find((t) => t.id === '638')!.owner?.score, 50);
  assert.equal(updated.find((t) => t.id === '250')!.owner?.score, 100);
});
