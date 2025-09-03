import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

/* ---- helpers: walk coords + detect CRS ---- */
function forEachCoord(geom, cb) {
  if (!geom) return;
  const { type, coordinates, geometries } = geom;
  switch (type) {
    case "Point": cb(coordinates); break;
    case "MultiPoint":
    case "LineString": coordinates.forEach(cb); break;
    case "MultiLineString": coordinates.forEach(line => line.forEach(cb)); break;
    case "Polygon": coordinates.forEach(ring => ring.forEach(cb)); break;
    case "MultiPolygon": coordinates.forEach(poly => poly.forEach(ring => ring.forEach(cb))); break;
    case "GeometryCollection": geometries?.forEach(g => forEachCoord(g, cb)); break;
    default: break;
  }
}

function looksLikeDegrees(fc) {
  // Heuristic: sample up to ~2000 coords; if any |x|>180 or |y|>90, it's not degrees
  let maxAbsX = 0, maxAbsY = 0, count = 0;
  for (const f of fc.features ?? []) {
    forEachCoord(f.geometry, ([x, y]) => {
      if (typeof x === "number" && typeof y === "number") {
        maxAbsX = Math.max(maxAbsX, Math.abs(x));
        maxAbsY = Math.max(maxAbsY, Math.abs(y));
        count++;
      }
    });
    if (count > 2000) break;
  }
  // Respect explicit CRS hint if present
  const crsName = fc?.crs?.properties?.name || "";
  if (/3857|900913|web ?mercator/i.test(crsName)) return false; // planar meters
  if (/4326|wgs ?84|crs84/i.test(crsName)) return true;         // lon/lat degrees
  // Fallback to numeric range
  return maxAbsX <= 180 && maxAbsY <= 90;
}

export default function GautengCreativeMap({ featuresGeoJson, points = [] }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);

  const [dims, setDims] = useState({ width: 900, height: 650 });
  const [hover, setHover] = useState(null);

  const colors = ["#e8f0fe", "#d7f7e9", "#ffe9c6", "#fce1ef", "#e6f6ff"];

  // Resize responsively to container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setDims({ width: w, height: Math.max(420, Math.round(w * 0.7)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isDegrees = useMemo(
    () => (featuresGeoJson ? looksLikeDegrees(featuresGeoJson) : true),
    [featuresGeoJson]
  );

  // Projection with padding; auto-switch between Mercator (degrees) and Identity (planar)
  const projection = useMemo(() => {
    if (!featuresGeoJson) return null;
    const pad = 24;
    if (isDegrees) {
      return d3.geoMercator().fitExtent(
        [[pad, pad], [dims.width - pad, dims.height - pad]],
        featuresGeoJson
      );
    } else {
      // planar coordinates (already projected). Y is typically "down" in SVG, so reflectY(true).
      return d3.geoIdentity().reflectY(true).fitExtent(
        [[pad, pad], [dims.width - pad, dims.height - pad]],
        featuresGeoJson
      );
    }
  }, [featuresGeoJson, dims, isDegrees]);

  const path = useMemo(() => (projection ? d3.geoPath(projection) : null), [projection]);

  // Zoom/pan
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoomed = (event) => g.attr("transform", event.transform);
    const zoom = d3.zoom().scaleExtent([1, 12]).on("zoom", zoomed);
    svg.call(zoom);

    // double-click to reset
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => {
      svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
    });

    return () => svg.on(".zoom", null);
  }, [dims]);

  // DEBUG log once we have projection
  useEffect(() => {
    if (!featuresGeoJson || !path) return;
    const summary = {
      collType: featuresGeoJson?.type,
      n: featuresGeoJson?.features?.length,
      firstGeom: featuresGeoJson?.features?.[0]?.geometry?.type,
      mode: isDegrees ? "degrees (WGS84-ish)" : "planar (identity)",
      bounds: path.bounds(featuresGeoJson),
    };
    console.log("geo summary:", summary);
  }, [featuresGeoJson, path, isDegrees]);

  if (!featuresGeoJson) return null;

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        style={{
          display: "block",
          background: "#fafafa",
          borderRadius: 16,
          border: "1px solid #e6e6e6",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
        role="img"
        aria-label="Gauteng creative infrastructure map"
      >
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.25" />
          </filter>
        </defs>

        <g ref={gRef}>
          {/* Bounds box (red) */}
          {path && (() => {
            const [[x0, y0], [x1, y1]] = path.bounds(featuresGeoJson);
            return (
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={y1 - y0}
                fill="none"
                stroke="red"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}

          {/* Whole collection outline for certainty */}
          {path && (
            <path
              d={path(featuresGeoJson)}
              fill="none"
              stroke="#111"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Per-district fill (remove if you only want outlines) */}
          {path && featuresGeoJson.features?.map((f, i) => (
            <path
              key={i}
              d={path(f)}
              fill={colors[i % colors.length]}
              stroke="#333"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Points: only draw when boundary is in degrees (so they align) */}
          {isDegrees && path &&
            points.map((p) => {
              const [x, y] = projection([p.lon, p.lat]) || [null, null];
              if (x == null || y == null) return null;
              return (
                <g key={p.id} transform={`translate(${x},${y})`}>
                  <circle
                    r={4.5}
                    fill="#111"
                    filter="url(#shadow)"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover({ x, y, p })}
                    onMouseLeave={() => setHover(null)}
                  />
                  <circle r={10} fill="transparent" />
                </g>
              );
            })}
        </g>
      </svg>

      {/* Tooltip */}
      {hover && (
        <div style={{ position: "relative", width: 0, height: 0 }}>
          <div
            style={{
              position: "absolute",
              left: hover.x,
              top: hover.y,
              transform: "translate(12px, -12px)",
              background: "#111",
              color: "#fff",
              padding: "8px 10px",
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.35,
              maxWidth: 260,
              boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{hover.p.name}</div>
            <div style={{ opacity: 0.9 }}>
              {hover.p.type}{hover.p.category ? ` · ${hover.p.category}` : ""}
            </div>
            {hover.p.website && (
              <div style={{ marginTop: 6 }}>
                <a href={hover.p.website} target="_blank" rel="noreferrer" style={{ color: "#9EE6FF" }}>
                  Visit site →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {!isDegrees && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Note: boundary looks planar, so markers are hidden until it’s reprojected to WGS84.
        </div>
      )}
    </div>
  );
}
