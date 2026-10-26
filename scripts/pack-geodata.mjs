// Run after downloading the two pinned Natural Earth files listed in the manifest.
// The compact archive is committed so normal builds never need a network connection.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('./geodata/', import.meta.url);
const sources = ['map-units', 'map-subunits'].map((kind) => {
  const filename = `natural-earth-${kind}-10m.geojson`;
  const bytes = readFileSync(new URL(filename, root));
  return {
    kind,
    url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_${kind.replace('map-', 'map_')}.geojson`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    data: JSON.parse(bytes),
  };
});
const units = sources[0].data.features.filter((f) => f.properties.GU_A3 !== 'USA');
units.push(...sources[1].data.features.filter((f) => f.properties.GU_A3 === 'USA'));
const fields = [
  'NAME',
  'NAME_FR',
  'NAME_LONG',
  'SOV_A3',
  'ADM0_A3',
  'GU_A3',
  'SU_A3',
  'ISO_A2_EH',
  'HOMEPART',
  'LABEL_X',
  'LABEL_Y',
];
const data = {
  type: 'FeatureCollection',
  features: units.map((f) => ({
    type: 'Feature',
    properties: Object.fromEntries(fields.map((field) => [field, f.properties[field]])),
    geometry: f.geometry,
  })),
};
writeFileSync(
  new URL('natural-earth-10m.json.gz', root),
  gzipSync(JSON.stringify(data), { level: 9 }),
);
writeFileSync(
  new URL('manifest.json', root),
  JSON.stringify(
    {
      version: '5.1.2',
      scale: '1:10m',
      license: 'Public domain — https://www.naturalearthdata.com/about/terms-of-use/',
      sources: sources.map(({ kind, url, sha256 }) => ({ kind, url, sha256 })),
      content:
        '298 map units; USA replaced by its three map subunits (mainland, Alaska, Hawaii). Properties trimmed; original geometry retained.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Packed ${data.features.length} source features.`);
