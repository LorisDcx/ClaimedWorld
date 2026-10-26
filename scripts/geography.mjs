import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import iso from 'i18n-iso-countries';

const fr = new Intl.DisplayNames(['fr'], { type: 'region' });
const distinctUnits = new Set(['PMD', 'PAZ', 'NJM', 'PNB', 'TZZ', 'CSI', 'ATC', 'CLP', 'BRI']);
const legacyIds = {
  SOL: 'somaliland',
  CYN: 'n-cyprus',
  KAS: 'siachen-glacier',
  ATC: 'ashmore-and-cartier-is',
};
const names = {
  REU: 'La Réunion',
  FXX: 'France',
  PGA: 'Îles Spratleys',
  KNX: 'Zone coréenne démilitarisée (sud)',
  KNZ: 'Zone coréenne démilitarisée (nord)',
  SXM: 'Saint-Martin (partie néerlandaise)',
  MAF: 'Saint-Martin (partie française)',
};
// Geographic labels only: a parent never shares the child's scores or advertising slot.
const parentCodes = {
  FR: ['GF', 'GP', 'MQ', 'RE', 'YT', 'NC', 'PF', 'WF', 'PM', 'MF', 'BL', 'TF'],
  US: ['AS', 'GU', 'MP', 'VI', 'PR'],
  GB: ['GI', 'TC', 'PN', 'MS', 'AI', 'VG', 'KY', 'BM', 'SH', 'JE', 'GG', 'IM', 'IO', 'GS', 'FK'],
  AU: ['HM', 'CC', 'NF', 'CX'],
  NZ: ['CK', 'NU', 'TK'],
  NL: ['BQ', 'AW', 'CW', 'SX'],
  DK: ['GL', 'FO'],
  NO: ['SJ', 'BV'],
  FI: ['AX'],
  CN: ['HK', 'MO'],
};
const unitParents = {
  PMD: 'PT',
  PAZ: 'PT',
  NJM: 'NO',
  PNB: 'PG',
  TZZ: 'TZ',
  CSI: 'AU',
  ATC: 'AU',
  CLP: 'FR',
  ESB: 'GB',
  WSB: 'GB',
};

export function loadGeography() {
  const source = JSON.parse(
    gunzipSync(readFileSync(new URL('./geodata/natural-earth-10m.json.gz', import.meta.url))),
  );
  const groups = new Map();
  for (const f of source.features) {
    const p = f.properties;
    const unit = p.GU_A3;
    const code = /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : '';
    if (code === 'AQ') continue;
    const usIsland = p.ADM0_A3 === 'UMI';
    const usState = p.SU_A3 === 'USH' || p.SU_A3 === 'USK';
    const distinct = distinctUnits.has(unit) || usIsland || usState;
    const numeric = code ? iso.alpha2ToNumeric(code) : undefined;
    const id = usState
      ? p.SU_A3 === 'USH'
        ? 'us-hi'
        : 'us-ak'
      : legacyIds[unit] ||
        (code === 'XK' ? 'kosovo' : distinct || !numeric ? `ne-${unit.toLowerCase()}` : numeric);
    let parentCode = usIsland || usState ? 'US' : unitParents[unit];
    if (!parentCode)
      parentCode = Object.entries(parentCodes).find(([, children]) => children.includes(code))?.[0];
    const localName = usState
      ? p.NAME_FR
      : names[unit] || (distinct || !numeric || parentCode ? p.NAME_FR : fr.of(code));
    const name = localName[0].toUpperCase() + localName.slice(1);
    const parentName = parentCode ? fr.of(parentCode) : null;
    const current = groups.get(id);
    const polygons =
      f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    if (current) {
      current.geometry.coordinates.push(...polygons);
      current.properties.units.push(unit);
    } else {
      groups.set(id, {
        type: 'Feature',
        id,
        properties: {
          name: parentName ? `${name} / ${parentName}` : name,
          englishName:
            distinct || parentName || !numeric
              ? p.NAME_LONG || p.NAME
              : new Intl.DisplayNames(['en'], { type: 'region' }).of(code),
          code,
          parentName,
          units: [unit],
          label: [p.LABEL_X, p.LABEL_Y],
        },
        geometry: { type: 'MultiPolygon', coordinates: [...polygons] },
      });
    }
  }
  return { type: 'FeatureCollection', features: [...groups.values()] };
}
