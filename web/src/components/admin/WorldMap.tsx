import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import countries from "@/lib/countries.json";

const WIDTH = 960;
const HEIGHT = 470;

const ALPHA2 = countries as unknown as Record<string, [string, string]>;
const NUMERIC_TO_ALPHA2: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA2).map(([a2, [num]]) => [num, a2]),
);

let displayNames: Intl.DisplayNames | null = null;
export function countryName(code: string) {
  try {
    displayNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryRegion(code: string) {
  return ALPHA2[code]?.[1] ?? "Other";
}

/** Users by country on a world map, shaded by count. */
export default function WorldMap({ counts }: { counts: Record<string, number> }) {
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const shapes = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
    const geo = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
    const land = geo.features.filter((f) => f.properties?.name !== "Antarctica");
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: "FeatureCollection", features: land });
    const path = geoPath(projection);
    return land.map((f: Feature<Geometry, { name: string }>) => ({
      code: NUMERIC_TO_ALPHA2[String(f.id).padStart(3, "0")] ?? "",
      name: f.properties?.name ?? "",
      d: path(f) ?? "",
    }));
  }, []);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="world-map" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Users by country">
        {shapes.map((s, i) => {
          const n = counts[s.code] ?? 0;
          const shade = n ? 0.25 + 0.75 * Math.sqrt(n / max) : 0;
          return (
            <path
              key={`${s.code}-${i}`}
              d={s.d}
              className={n ? "has-users" : undefined}
              style={n ? { fillOpacity: shade } : undefined}
              tabIndex={n ? 0 : -1}
              aria-label={n ? `${countryName(s.code)}: ${n} ${n === 1 ? "user" : "users"}` : undefined}
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ code: s.code || s.name, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
              onFocus={(e) => {
                const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
                const b = e.currentTarget.getBoundingClientRect();
                const box = svg.getBoundingClientRect();
                setHover({ code: s.code, x: b.left - box.left + b.width / 2, y: b.top - box.top });
              }}
              onBlur={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="world-map-tip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.code.length === 2 ? countryName(hover.code) : hover.code}</strong>
          <span>
            {counts[hover.code] ?? 0} {(counts[hover.code] ?? 0) === 1 ? "user" : "users"}
          </span>
        </div>
      )}
    </div>
  );
}
