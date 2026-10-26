import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { topology } from 'topojson-server';
import { feature, neighbors } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import { geoProjection, geoPath, geoArea, geoGraticule10 } from 'd3-geo';
import { loadGeography } from './geography.mjs';
import { logoPlacement } from './logo-placement.mjs';
const source = loadGeography();
const weighted = presimplify(topology({ territories: source }, 1e7));
// Shared source arcs define land borders, independently of projection or zoom.
const geometries = weighted.objects.territories.geometries;
const adjacency = Object.fromEntries(
  neighbors(geometries).map((indices, i) => [
    String(geometries[i].id),
    indices.map((j) => String(geometries[j].id)).sort(),
  ]),
);
// topojson-simplify quantiles are descending: retain the most significant 12%.
const threshold = quantile(weighted, 0.12);
for (const arc of weighted.arcs) {
  const xs = arc.map((p) => p[0]),
    ys = arc.map((p) => p[1]);
  // Preserve small islands and atolls instead of simplifying them away.
  if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 0.2) {
    // A small ring needs a faithful outline, not hundreds of sub-pixel vertices.
    const stride = Math.max(1, Math.ceil(arc.length / 24));
    for (let index = 0; index < arc.length; index += stride) arc[index][2] = Infinity;
  }
  // Isolated closed rings must retain at least three distinct vertices.
  if (arc.length >= 4 && arc[0][0] === arc.at(-1)[0] && arc[0][1] === arc.at(-1)[1]) {
    arc[Math.floor((arc.length - 1) / 3)][2] = Infinity;
    arc[Math.floor((2 * (arc.length - 1)) / 3)][2] = Infinity;
  }
}
const collection = feature(simplify(weighted, threshold), weighted.objects.territories);
// Quantizing and simplifying minute rings can reverse their signed area.
// Restore D3's clockwise exteriors / counterclockwise holes after decoding.
for (const f of collection.features) {
  for (const polygon of f.geometry.coordinates) {
    polygon.forEach((ring, index) => {
      const complement = geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI;
      if (complement === (index === 0)) ring.reverse();
    });
  }
}
// Miller cylindrical: straight meridians/parallels and finite polar limits.
const millerRaw = (longitude, latitude) => [
  longitude,
  1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * latitude)),
];
const projection = geoProjection(millerRaw).fitExtent(
  [
    [22, 25],
    [1078, 567],
  ],
  collection,
);
const path = geoPath(projection).digits(3);
const rounded = (point) => point.map((value) => Math.round(value * 10000) / 10000);
const countries = collection.features
  .map((f) => {
    const { name, englishName, code, parentName, label } = f.properties;
    const id = f.id;
    const anchors = [];
    const polygons = f.geometry.coordinates.map((coordinates) => ({
      coordinates,
      area: path.area({ type: 'Polygon', coordinates }),
    }));
    const largestArea = Math.max(...polygons.map((p) => p.area));
    const mainland = polygons.reduce((largest, polygon) =>
      polygon.area > largest.area ? polygon : largest,
    );
    const sponsorBox = logoPlacement(mainland.coordinates.map((ring) => ring.map(projection)));
    const visiblePath = (minimumArea) =>
      path({
        type: 'MultiPolygon',
        coordinates: polygons.filter((p) => p.area >= minimumArea).map((p) => p.coordinates),
      }) || '';
    // One discreet location per otherwise invisible named territory, never one per islet.
    // Unnamed/disputed slivers stay searchable without crowding the overview.
    if (largestArea < 0.7 && code && id !== 'ne-bri') {
      anchors.push({ point: rounded(projection(label)), size: Math.sqrt(largestArea) });
    }
    return {
      id,
      name,
      englishName,
      parentName,
      code,
      flag: code
        ? [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('')
        : '◈',
      path: path(f),
      overviewPath: visiblePath(0.7),
      regionalPath: visiblePath(0.03),
      center: rounded(projection(label)),
      bounds: path.bounds(f).map(rounded),
      sponsorBox,
      anchors,
      overviewMarker:
        anchors.length > 0 && ['MH', 'FM', 'KI', 'TV', 'NR', 'PW', 'SC', 'MV'].includes(code),
      area: geoArea(f),
      tier: ['840', '250', '826', '276', '156', '392', '356', '076', '124', '036'].includes(id)
        ? 100
        : geoArea(f) > 0.015
          ? 30
          : 10,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
if (new Set(countries.map((c) => c.id)).size !== countries.length)
  throw new Error('Territory IDs must be unique');
if (countries.some((c) => !c.path || !c.center.every(Number.isFinite)))
  throw new Error('Invalid territory geometry');
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/countries.json', JSON.stringify(countries));
writeFileSync('src/data/neighbors.json', JSON.stringify(adjacency));
writeFileSync('src/data/graticule.json', JSON.stringify(path(geoGraticule10())));
writeFileSync(
  'src/data/oceans.json',
  JSON.stringify(
    [
      ['OCÉAN PACIFIQUE', [-143, -7]],
      ['OCÉAN ATLANTIQUE', [-30, 2]],
      ['OCÉAN INDIEN', [80, -27]],
      ['OCÉAN PACIFIQUE', [167, 34]],
    ].map(([name, coordinate]) => ({ name, point: rounded(projection(coordinate)) })),
  ),
);
mkdirSync('public/flags', { recursive: true });
for (const c of countries) {
  const source = `node_modules/country-flag-icons/3x2/${c.code}.svg`;
  if (c.code && existsSync(source)) copyFileSync(source, `public/flags/${c.code}.svg`);
}
console.log(`Generated ${countries.length} independent game territories from Natural Earth 1:10m.`);
