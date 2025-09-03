import React, { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";

// Wide-ish bbox around Gauteng: [minLon, minLat, maxLon, maxLat]
const BBOX_GAUTENG = [26.0, -27.8, 29.9, -25.0];

// --- helpers ----------------------------------------------------
const ringBBox = (ring) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x,y] of ring || []) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
};

const bboxesIntersect = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const isClearlyTooBig = (bbox) => {
  const w = bbox[2] - bbox[0];
  const h = bbox[3] - bbox[1];
  // Anything ~country/world scale in degrees—exclude
  return w > 20 || h > 20;
};

function sanitizeByBBox(fc, bbox) {
  if (!fc || fc.type !== "FeatureCollection") return fc;

  const keepPolygon = (poly) => {
    // poly: [ring[], ring[], ...]
    // Keep rings that overlap bbox and aren't huge
    const kept = [];
    for (const ring of poly) {
      const rb = ringBBox(ring);
      if (!isClearlyTooBig(rb) && bboxesIntersect(rb, bbox)) kept.push(ring);
    }
    return kept.length ? kept : null;
  };

  const cleanGeom = (geom) => {
    if (!geom) return geom;
    if (geom.type === "Polygon") {
      const kept = keepPolygon(geom.coordinates || []);
      return kept ? { ...geom, coordinates: kept } : null;
    }
    if (geom.type === "MultiPolygon") {
      const polys = [];
      for (const poly of geom.coordinates || []) {
        const kept = keepPolygon(poly);
        if (kept) polys.push(kept);
      }
      return polys.length ? { ...geom, coordinates: polys } : null;
    }
    if (geom.type === "GeometryCollection") {
      const geoms = (geom.geometries || []).map(cleanGeom).filter(Boolean);
      return { ...geom, geometries: geoms };
    }
    return geom; // points/lines
  };

  return {
    ...fc,
    features: (fc.features || [])
      .map(f => ({ ...f, geometry: cleanGeom(f.geometry) }))
      .filter(f => f.geometry),
  };
}
// ----------------------------------------------------------------

export default function SimpleMapBBox() {
  const [raw, setRaw] = useState(null);
  const [fc, setFc] = useState(null);

  const width = 900, height = 640, pad = 24;

  useEffect(() => {
    fetch("/gauteng.json")
      .then(r => r.json())
      .then(json => {
        setRaw(json);
        setFc(sanitizeByBBox(json, BBOX_GAUTENG));
      })
      .catch(e => console.error("Failed to load /gauteng.json", e));
  }, []);

  const projection = useMemo(() => {
    if (!fc) return null;
    return d3.geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], fc);
  }, [fc]);

  const path = useMemo(() => (projection ? d3.geoPath(projection) : null), [projection]);

  if (!fc || !path) return <div style={{ padding: 16 }}>Loading…</div>;

  const [[x0, y0], [x1, y1]] = path.bounds(fc);

  return (
    <div style={{ padding: 16 }}>
      <svg width={width} height={height} style={{ background: "#fff", border: "1px solid #000", borderRadius: 8 }}>
        {/* Debug bounds */}
        <rect x={x0} y={y0} width={x1-x0} height={y1-y0} fill="none" stroke="red" strokeWidth={2} />

        {/* Clean outline + light fill */}
        <path
          d={path(fc)}
          fill="#cfe8ff"
          fillRule="evenodd"
          stroke="#0d47a1"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Each district outline */}
        {fc.features?.map((f,i) => (
          <path key={i} d={path(f)} fill="none" stroke="#1565c0" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        ))}

        {/* Test dot */}
        <circle cx="60" cy="60" r="8" fill="magenta" />
      </svg>

      <pre style={{ marginTop: 12, background: "#fafafa", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(
          {
            raw: { type: raw?.type, n: raw?.features?.length, first: raw?.features?.[0]?.geometry?.type },
            sanitized: { type: fc?.type, n: fc?.features?.length, first: fc?.features?.[0]?.geometry?.type }
          },
          null, 2
        )}
      </pre>
    </div>
  );
}
