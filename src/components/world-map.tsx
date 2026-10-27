'use client';
import { countryLabel } from '@/i18n/countries';
import { useT, useLocale } from '@/i18n/provider';

import { useEffect, useId, useRef, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import data from '@/data/countries.json';
import graticule from '@/data/graticule.json';
import oceans from '@/data/oceans.json';
import type { Country, Territory } from '@/lib/types';
const countries = data as Country[];
export default function WorldMap({
  territories,
  selected,
  onSelect,
  filter,
  focusId,
  immersive = false,
}: {
  territories: Territory[];
  selected: string | null;
  onSelect: (id: string) => void;
  filter: string;
  focusId: { id: string; nonce: number } | null;
  immersive?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const mapId = useId().replace(/:/g, '');
  const visiblePath = (c: Country) =>
    view.scale < 4 ? c.overviewPath : view.scale < 12 ? c.regionalPath : c.path;
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const [lastFocus, setLastFocus] = useState<typeof focusId>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const unit = (immersive ? Math.max : Math.min)(rect.width / 1100, rect.height / 600);
      const cx = (event.clientX - rect.left - (rect.width - 1100 * unit) / 2) / unit,
        cy = (event.clientY - rect.top - (rect.height - 600 * unit) / 2) / unit;
      setView((v) => {
        const scale = Math.min(40, Math.max(1, v.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const f = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
      });
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [immersive]);
  const byId = new Map(territories.map((t) => [t.id, t]));
  if (focusId && lastFocus !== focusId) {
    setLastFocus(focusId);
    const c = countries.find((c) => c.id === focusId.id);
    if (c) {
      const scale = Math.min(
        30,
        Math.max(
          2,
          380 / Math.max(c.bounds[1][0] - c.bounds[0][0], c.bounds[1][1] - c.bounds[0][1], 8),
        ),
      );
      setView({ x: 550 - c.center[0] * scale, y: 300 - c.center[1] * scale, scale });
    }
  }
  function zoom(factor: number, cx = 550, cy = 300) {
    setView((v) => {
      const scale = Math.min(40, Math.max(1, v.scale * factor));
      const f = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }
  return (
    <div className="world-map">
      <svg
        ref={svgRef}
        viewBox="0 0 1100 600"
        preserveAspectRatio={immersive ? 'xMidYMid slice' : 'xMidYMid meet'}
        aria-label={t("Carte interactive du monde")}
        role="img"
        onPointerDown={(e) => {
          setDragging(true);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId))
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.current) zoom(distance / pinch.current);
            pinch.current = distance;
            if (drag.current) drag.current.moved = true;
            return;
          }
          if (drag.current && e.buttons === 1) {
            const rect = svgRef.current!.getBoundingClientRect();
            const unit = (immersive ? Math.max : Math.min)(rect.width / 1100, rect.height / 600);
            const dx = (e.clientX - drag.current.x) / unit,
              dy = (e.clientY - drag.current.y) / unit;
            if (Math.abs(dx) + Math.abs(dy) > 5) {
              drag.current.moved = true;
              setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
              svgRef.current?.setPointerCapture(e.pointerId);
            }
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          setDragging(pointers.current.size > 0);
          pinch.current = null;
          if (svgRef.current?.hasPointerCapture(e.pointerId))
            svgRef.current.releasePointerCapture(e.pointerId);
          setTimeout(() => {
            drag.current = null;
          }, 0);
        }}
        onPointerCancel={() => {
          setDragging(false);
          drag.current = null;
          pointers.current.clear();
          pinch.current = null;
        }}
        focusable="false"
      >
        <g
          className={`map-geography ${dragging ? 'is-dragging' : ''}`}
          transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
        >
          <defs>
            <filter id={`${mapId}-logo-matte`} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -5 -5 -5 0 14"
              />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
            {countries
              .filter((c) => byId.get(c.id)?.owner || byId.get(c.id)?.sponsor)
              .map((c) => (
                <clipPath key={c.id} id={`${mapId}-border-${c.id}`} clipPathUnits="userSpaceOnUse">
                  <path d={visiblePath(c)} />
                </clipPath>
              ))}
          </defs>
          <path
            d={graticule}
            fill="none"
            stroke="var(--map-grid, #111111)"
            strokeOpacity=".07"
            strokeWidth=".45"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <g className="ocean-labels" fill="var(--map-ocean, #9b9b9b)" textAnchor="middle">
            {oceans.map((ocean, index) => (
              <text
                key={index}
                transform={`translate(${ocean.point.join(' ')}) scale(${1 / view.scale})`}
              >
                {t(ocean.name)}
              </text>
            ))}
          </g>
          {countries.map((c) => {
            const territory = byId.get(c.id);
            const o = territory?.owner;
            const dimmed =
              filter === 'neutral'
                ? !!o
                : filter === 'sponsored'
                  ? !territory?.sponsor
                  : filter !== 'all' && filter !== o?.id;
            return (
              <path
                key={c.id}
                d={visiblePath(c)}
                fill={
                  territory?.sponsor
                    ? 'var(--map-sponsored, #f0f0ed)'
                    : selected === c.id
                      ? 'var(--map-selected, #383838)'
                      : 'var(--map-country, #141414)'
                }
                stroke={o ? 'none' : 'var(--map-border, #ffffff)'}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                className={`country-path ${territory?.sponsor ? 'is-sponsored' : ''} ${dimmed ? 'dimmed' : ''} ${selected === c.id ? 'selected' : ''}`}
                role="button"
                aria-label={countryLabel(c, locale)}
                focusable="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.currentTarget.blur();
                  if (!drag.current?.moved) onSelect(c.id);
                }}
              />
            );
          })}
          <g pointerEvents="none" aria-hidden="true">
            {countries
              .filter((c) => byId.get(c.id)?.sponsor)
              .map((c) => {
                const territory = byId.get(c.id)!;
                const sponsor = territory.sponsor!;
                const [x, y, width, height] = c.sponsorBox;
                const dimmed =
                  filter === 'neutral'
                    ? !!territory.owner
                    : filter !== 'all' && filter !== 'sponsored' && filter !== territory.owner?.id;
                return (
                  <g
                    key={c.id}
                    className={`map-sponsor ${dimmed ? 'dimmed' : ''}`}
                    data-territory={c.id}
                    clipPath={`url(#${mapId}-border-${c.id})`}
                  >
                    {sponsor.logo_id || sponsor.logo_url ? (
                      <image
                        href={sponsor.logo_url || `/api/media/${sponsor.logo_id}`}
                        filter={
                          sponsor.id === 'house-cramdesk' ? `url(#${mapId}-logo-matte)` : undefined
                        }
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    ) : (
                      <text
                        x={x + width / 2}
                        y={y + height / 2}
                        dominantBaseline="central"
                        textAnchor="middle"
                        fontSize={Math.min(
                          height * 0.6,
                          width / Math.max(sponsor.initials.length, 1),
                        )}
                        fontWeight="800"
                        fill={sponsor.color}
                      >
                        {sponsor.initials}
                      </text>
                    )}
                  </g>
                );
              })}
          </g>
          {/* Paint ownership after every surface. Clipping keeps each band on its
              own side of a shared edge, independent of country draw order. */}
          <g className="ownership-borders" pointerEvents="none" aria-hidden="true">
            {countries
              .filter((c) => byId.get(c.id)?.owner)
              .map((c) => {
                const territory = byId.get(c.id)!;
                const owner = territory.owner!;
                const dimmed =
                  filter === 'neutral' ||
                  (filter === 'sponsored'
                    ? !territory.sponsor
                    : filter !== 'all' && filter !== owner.id);
                return (
                  <g
                    key={c.id}
                    data-territory={c.id}
                    className={`ownership-border ${dimmed ? 'dimmed' : ''}`}
                    clipPath={`url(#${mapId}-border-${c.id})`}
                    fill="none"
                    strokeLinejoin="round"
                  >
                    {owner.appearance?.border === 'double' && (
                      <>
                        <path
                          d={visiblePath(c)}
                          stroke={owner.color}
                          strokeWidth="11"
                          vectorEffect="non-scaling-stroke"
                        />
                        <path
                          d={visiblePath(c)}
                          stroke="#141414"
                          strokeWidth="8.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    )}
                    {owner.appearance?.border === 'signal' && (
                      <path
                        d={visiblePath(c)}
                        stroke={owner.color}
                        strokeWidth="11"
                        strokeDasharray="2 8"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <path
                      d={visiblePath(c)}
                      stroke={owner.color}
                      strokeWidth="6"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={visiblePath(c)}
                      stroke="#141414"
                      strokeWidth=".8"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
          </g>
          {countries.flatMap((c) => {
            if (view.scale < 4 && !c.overviewMarker && selected !== c.id) return [];
            const territory = byId.get(c.id);
            const owner = territory?.owner;
            const dimmed =
              filter === 'neutral'
                ? !!owner
                : filter === 'sponsored'
                  ? !territory?.sponsor
                  : filter !== 'all' && filter !== owner?.id;
            return c.anchors
              .filter((anchor) => anchor.size * view.scale < 3)
              .map((anchor, index) => (
                <g
                  key={`island-${c.id}-${index}`}
                  className={`island-marker ${dimmed ? 'dimmed' : ''}`}
                  transform={`translate(${anchor.point.join(' ')}) scale(${1 / view.scale})`}
                  data-territory={c.id}
                  role="button"
                  aria-label={countryLabel(c, locale)}
                  focusable="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    if (!drag.current?.moved) onSelect(c.id);
                  }}
                >
                  <circle r="4" fill="transparent" />
                  <circle
                    r="1"
                    fill={
                      selected === c.id
                        ? 'var(--map-selected, #666666)'
                        : owner?.color || 'var(--map-country, #141414)'
                    }
                    pointerEvents="none"
                  />
                </g>
              ));
          })}
          {selected &&
            (() => {
              const c = countries.find((c) => c.id === selected);
              if (!c || byId.get(c.id)?.sponsor) return null;
              return (
                <g
                  pointerEvents="none"
                  transform={`translate(${c.center.join(' ')}) scale(${1 / view.scale})`}
                >
                  <circle r="8" fill="#ffffff" fillOpacity=".12" stroke="#ffffff" strokeWidth="1" />
                  <circle r="3" fill="#111111" stroke="white" strokeWidth="1.5" />
                </g>
              );
            })()}
        </g>
      </svg>
      <div className="map-controls">
        <button onClick={() => zoom(1.4)} title={t("Zoom avant")} aria-label={t("Zoom avant")}>
          <Plus size={17} />
        </button>
        <button onClick={() => zoom(1 / 1.4)} title={t("Zoom arrière")} aria-label={t("Zoom arrière")}>
          <Minus size={17} />
        </button>
        <span />
        <button
          onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          title={t("Recentrer la carte")}
          aria-label={t("Recentrer la carte")}
        >
          <Crosshair size={17} />
        </button>
      </div>
      <div className="map-scale">
        <span />
        {view.scale.toFixed(1)}× <span className="desktop-only">{t("· Glissez pour explorer")}</span>
      </div>
    </div>
  );
}
