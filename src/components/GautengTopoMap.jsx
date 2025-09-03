// src/components/GautengTopoMap.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { feature, mesh } from "topojson-client";

export default function GautengTopoMap({
  topoUrl = "/gauteng_adm2.topo.json",
  points = [], // [{id, name, lat, lon, ...}]
}) {
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomRef = useRef(null); // { zoom, svg }

  const [topology, setTopology] = useState(null);
  const [dims, setDims] = useState({ w: 960, h: 640 });

  // Responsive width → height ~ 2:3
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width || 960;
      setDims({ w, h: Math.max(420, Math.round(w * 0.66)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load TopoJSON
  useEffect(() => {
    fetch(topoUrl).then(r => r.json()).then(setTopology);
  }, [topoUrl]);

  // Convert once loaded
  const objectName = useMemo(
    () => (topology ? Object.keys(topology.objects)[0] : null),
    [topology]
  );
  const fc = useMemo(
    () => (topology && objectName ? feature(topology, topology.objects[objectName]) : null),
    [topology, objectName]
  );
  const borders = useMemo(
    () => (topology && objectName ? mesh(topology, topology.objects[objectName], (a, b) => a !== b) : null),
    [topology, objectName]
  );
  const outline = useMemo(
    () => (topology && objectName ? mesh(topology, topology.objects[objectName], (a, b) => a === b) : null),
    [topology, objectName]
  );

  // Projection + path
  const pad = 24;
  const projection = useMemo(() => {
    if (!fc) return null;
    return d3.geoMercator().fitExtent([[pad, pad], [dims.w - pad, dims.h - pad]], fc);
  }, [fc, dims]);
  const path = useMemo(() => (projection ? d3.geoPath(projection) : null), [projection]);

  // Zoom/pan — store the zoom instance in a ref (fixes undefined error)
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoomed = (e) => g.attr("transform", e.transform);
    const zoom = d3.zoom().scaleExtent([1, 12]).on("zoom", zoomed);

    svg.call(zoom);
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity));

    zoomRef.current = { zoom, svg }; // <- safe home for the zoom instance
    return () => {
      svg.on(".zoom", null);
      zoomRef.current = null;
    };
  }, [dims, path]);

  // Click-to-zoom
  const zoomToFeature = (f) => {
    if (!path || !zoomRef.current) return; // ignore early clicks
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const dx = x1 - x0, dy = y1 - y0;
    const scale = Math.min(12, 0.9 / Math.max(dx / dims.w, dy / dims.h));
    const tx = (dims.w - scale * (x0 + x1)) / 2;
    const ty = (dims.h - scale * (y0 + y1)) / 2;
    const { zoom, svg } = zoomRef.current;
    svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  if (!fc || !path) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{ display: "block", background: "#fafafa", borderRadius: 16, border: "1px solid #e6e6e6" }}
      >
        <g ref={gRef}>
          {/* Filled districts (clickable) */}
          <g fill="#eaf2ff">
            {fc.features.map((f, i) => (
              <path key={i} d={path(f)} onClick={() => zoomToFeature(f)} cursor="pointer" />
            ))}
          </g>

          {/* Province outer outline */}
          <path
            d={path(outline)}
            fill="none"
            stroke="#111"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />

          {/* Internal borders (mesh) — rounded joins to avoid “broken” look */}
          <path
            d={path(borders)}
            fill="none"
            stroke="#333"
            strokeWidth={1}
            strokeLinejoin="round"
            strokeLinecap="round"
            shapeRendering="geometricPrecision"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />

          {/* Optional: your points */}
          {points.map((p) => {
            if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) return null;
            const [x, y] = projection([p.lon, p.lat]) || [null, null];
            if (x == null || y == null) return null;
            return (
              <g key={p.id} transform={`translate(${x},${y})`}>
                <circle r={4.5} fill="#111" />
                <circle r={10} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ marginTop: 8, color: "#666" }}>Click a district to zoom. Double-click to reset.</div>
    </div>
  );
}
