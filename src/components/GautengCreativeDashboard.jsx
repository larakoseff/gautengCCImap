import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import s from "./GautengCreativeDashboard.module.css";
import cityLabelsDefault from "../data/cities";
import { createPortal } from "react-dom";
import closeIcon from "/close.svg";

const getCategory = (p) =>
  p?.category ??
  p?.Category ??
  p?.type ??
  p?.Type ??
  p?.group ??
  p?.Group ??
  null;


  function jitterFromId(id, max = 6) {
    // FNV-1a-ish tiny hash
    let h = 2166136261 >>> 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const angle = (h % 360) * (Math.PI / 180);
    const r = (h % (max * 10)) / 10; // 0..max px
    return [Math.cos(angle) * r, Math.sin(angle) * r];
  }

  export default function GautengCreativeDashboard({
  topoUrl = "/gauteng_adm2.topo.json",
  points = [],
  leftTitle = "GAUTENG CREATIVE SECTOR\nSUPPORTIVE INFRASTRUCTURE",
  leftIntro = "Add 2–4 short sentences about what this map shows. Keep it concise and scannable.",
  categoryOrder,
  categoryColors,
  initialZoom = 1.5,
  cityLabels = cityLabelsDefault,
  dotRadius = 6,
  dotOpacity = 0.9,
}) {
  // ----- refs -----
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomRef = useRef(null);
  const mapRef = useRef(null);
  const wrapRef = useRef(null);

  // Detect hover capability (to disable hover on touch)
  const canHoverRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    const update = () => {
      canHoverRef.current = !!mq?.matches;
    };
    update();
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);

  // Legend filter
  const [activeCat, setActiveCat] = useState(null);
  const toggleCategory = (c) => setActiveCat((prev) => (prev === c ? null : c));

  // Modal state (mobile bottom sheet)
  const [isMobile, setIsMobile] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Track viewport for mobile
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Close helpers + Esc
  const closeModal = () => setIsModalOpen(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
        setActiveCat(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock body scroll when modal opens
  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen]);

  // If viewport grows past mobile while open, close the sheet
  useEffect(() => {
    if (!isMobile && isModalOpen) setIsModalOpen(false);
  }, [isMobile, isModalOpen]);

  // ----- initial zoom state -----
  const initialAppliedRef = useRef(false);
  const initialTransformRef = useRef(d3.zoomIdentity);

  // stable size: width from RO, height from the map element on real resizes only
  const [dims, setDims] = useState({ w: 1200, h: 720 });

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    const setHeightFromEl = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.max(520, Math.round(rect.height || window.innerHeight));
      setDims((d) => (d.h === h ? d : { ...d, h }));
    };

    // width-only updates via RO (do NOT touch height here)
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(640, Math.round(entry.contentRect.width));
      setDims((d) => (Math.abs(w - d.w) <= TOL ? d : { ...d, w }));
    });
    ro.observe(el);

    // read height after first paint so layout is settled
    const raf = requestAnimationFrame(setHeightFromEl);

    // keep height synced on real viewport changes
    window.addEventListener("resize", setHeightFromEl);
    window.addEventListener("orientationchange", setHeightFromEl);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setHeightFromEl);
      window.removeEventListener("orientationchange", setHeightFromEl);
    };
  }, []);

  // ----- load & convert topology -----
  const [topology, setTopology] = useState(null);
  useEffect(() => {
    fetch(topoUrl)
      .then((r) => r.json())
      .then(setTopology);
  }, [topoUrl]);

  const objName = useMemo(
    () => (topology ? Object.keys(topology.objects)[0] : null),
    [topology]
  );
  const fc = useMemo(
    () =>
      topology && objName ? feature(topology, topology.objects[objName]) : null,
    [topology, objName]
  );
  const outline = useMemo(
    () =>
      topology && objName
        ? mesh(topology, topology.objects[objName], (a, b) => a === b)
        : null,
    [topology, objName]
  );
  const borders = useMemo(
    () =>
      topology && objName
        ? mesh(topology, topology.objects[objName], (a, b) => a !== b)
        : null,
    [topology, objName]
  );

  // ----- projection & path -----
  const pad = 0;
  const projection = useMemo(() => {
    if (!fc) return null;
    return d3.geoMercator().fitExtent(
      [
        [pad, pad],
        [dims.w - pad, dims.h - pad],
      ],
      fc
    );
  }, [fc, dims]);
  const path = useMemo(
    () => (projection ? d3.geoPath(projection) : null),
    [projection]
  );

  // ----- zoom setup (dblclick → reset to initial transform) -----
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoomed = (e) => g.attr("transform", e.transform);
    const zoom = d3.zoom().scaleExtent([1, 12]).on("zoom", zoomed);

    svg.call(zoom);
    svg.on("dblclick.zoom", null);
    svg.on("dblclick", () =>
      svg
        .transition()
        .duration(400)
        .call(zoom.transform, initialTransformRef.current)
    );

    zoomRef.current = { zoom, svg };
    return () => {
      svg.on(".zoom", null);
      zoomRef.current = null;
    };
  }, [path]);

  // ----- apply initial zoom once -----
  useEffect(() => {
    if (!path || !zoomRef.current || initialAppliedRef.current) return;
    const { svg, zoom } = zoomRef.current;

    const k = Math.max(1, Number(initialZoom) || 1);
    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const t =
      k === 1
        ? d3.zoomIdentity
        : d3.zoomIdentity.translate(cx - k * cx, cy - k * cy).scale(k);

    svg.call(zoom.transform, t);
    initialTransformRef.current = t; // used by dblclick reset
    initialAppliedRef.current = true;
  }, [path, dims, initialZoom]);

  // ----- zoom to a clicked district -----
  const zoomToFeature = (f) => {
    if (!path || !zoomRef.current) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const dx = x1 - x0,
      dy = y1 - y0;
    const scale = Math.min(12, 0.9 / Math.max(dx / dims.w, dy / dims.h));
    const tx = (dims.w - scale * (x0 + x1)) / 2;
    const ty = (dims.h - scale * (y0 + y1)) / 2;
    const { zoom, svg } = zoomRef.current;
    svg
      .transition()
      .duration(650)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  // ----- categories & palette -----
  const categories = useMemo(() => {
    const raw = points.map(getCategory).filter(Boolean);
    const uniq = Array.from(new Set(raw));
    if (categoryOrder?.length) {
      const order = new Set(categoryOrder);
      const extras = uniq.filter((c) => !order.has(c)).sort();
      return [...categoryOrder, ...extras];
    }
    return uniq.sort();
  }, [points, categoryOrder]);
  

  const palette = useMemo(() => {
    if (categoryColors) return categoryColors;
    const base = [
      ...d3.schemeTableau10,
      ...d3.schemeSet3,
      "#AAEFC5",
      "#FA2692",
      "#B8525C",
      "#ff7f50",
      "#4B6895",
      "#7F24B8",
      "#F171EC",
      "#F5D824",
    ];
    const m = {};
    categories.forEach((c, i) => {
      m[c] = base[i % base.length];
    });
    m["Uncategorised"] = m["Uncategorised"] || "#111";
    return m;
  }, [categories, categoryColors]);

  // ----- hover & focus (sticky card) -----
  const [hover, setHover] = useState(null); // { x, y, p }
  const [focused, setFocused] = useState(null); // { p }

  // Throttle hover updates to the next animation frame
  const hoverRAF = useRef(0);
  const setHoverRAF = (val) => {
    if (hoverRAF.current) cancelAnimationFrame(hoverRAF.current);
    hoverRAF.current = requestAnimationFrame(() => setHover(val));
  };
  // Clean up on unmount (and React strict-mode re-mount)
  useEffect(() => {
    return () => {
      if (hoverRAF.current) cancelAnimationFrame(hoverRAF.current);
    };
  }, []);

  if (!fc || !path) return <div style={{ padding: 16 }}>Loading…</div>;

  const info = focused ?? hover;
  const cat = info ? getCategory(info.p) ?? "Uncategorised" : null;
  const hasImage = Boolean(info?.p?.image);
  

  return (
    <div className={s.wrap} ref={wrapRef}>
      {/* LEFT PANEL */}
      <aside className={s.left}>
        <h1 className={s.title}>{leftTitle}</h1>
        <p className={s.intro}>{leftIntro}</p>
        <p className={s.mobilemessage}>Click a dot for more info</p>
        <div
          className={`${s.card} ${!info ? s.cardEmpty : ""} ${
            hasImage ? s.cardHasImage : ""
          }`}
        >
          {info ? (
            <>
              {/* HEADER */}
              <div className={s.cardHeader}>
                <div className={s.cardDotandTitle}>
                  <span
                    className={s.cardDot}
                    style={{ "--cat-color": palette[cat] }}
                  />
                  <div className={s.cardTitle}>{info.p.name}</div>
                </div>
                {focused && (
                  <div className={s.closeBtn} onClick={() => setFocused(null)}>
                    <img src={closeIcon} alt="Close" />
                  </div>
                )}
              </div>

              {/* BODY */}
              <div className={s.cardBody}>
                <div className={s.cardMeta}>
                  {info.p.type ? `${info.p.type} · ` : ""}
                  {cat ?? "Uncategorised"}
                </div>
                {info.p.description && (
                  <p className={s.cardText}>{info.p.description}</p>
                )}
                {info.p.website && (
                  <a
                    className={s.cardLink}
                    href={info.p.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit website →
                  </a>
                )}
                {focused && (
                  <button
                    className={s.clearBtn}
                    onClick={() => setFocused(null)}
                  >
                    Clear pin
                  </button>
                )}
              </div>

              {/* IMAGE */}
              {info.p.image && (
                <div className={s.cardImage}>
                  <img src={info.p.image} alt="" />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Empty state header sits ABOVE the grid */}
              <div className={s.cardEmptyHint}>
                Hover a dot on the map to preview a venue here. Click a dot to
                pin details.
              </div>

              {/* Empty body: only used to show the grid overlay below the hint */}
              <div className={s.cardBody} />
            </>
          )}
        </div>
      </aside>

      {/* MAP */}
      <div className={s.map} ref={mapRef}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          className={s.svgBlock}
          role="img"
          aria-label="Gauteng supportive infrastructure map"
        >
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1"
                floodOpacity="0.25"
              />
            </filter>
          </defs>

          <g ref={gRef}>
            <g fill="#eef3fb">
              {fc.features.map((f, i) => (
                <path
                  key={i}
                  d={path(f)}
                  onClick={() => zoomToFeature(f)}
                  cursor="pointer"
                />
              ))}
            </g>

            <path
              d={path(outline)}
              fill="none"
              stroke="#111"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path(borders)}
              fill="none"
              stroke="#6b7280"
              strokeWidth={1}
              strokeLinejoin="round"
              strokeLinecap="round"
              shapeRendering="geometricPrecision"
              vectorEffect="non-scaling-stroke"
            />

            {points.map((p) => {
              if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat))
                return null;
                let [x, y] = projection([p.lon, p.lat]) || [null, null];
                if (x == null) return null;
                
                // optional deterministic spread:
                const [jx, jy] = jitterFromId(p.id, 5); // try 4–8px
                x += jx + (p.dx || 0);
                y += jy + (p.dy || 0);
              const pCat = getCategory(p) ?? "Uncategorised";
              const dimmed = activeCat && pCat !== activeCat;
              const isActiveCat = !activeCat || pCat === activeCat;
              const r = isActiveCat ? dotRadius : Math.max(2, dotRadius * 0.2);
              const isHot = hover?.p?.id === p.id || focused?.p?.id === p.id;

              return (
                <g
                  key={p.id}
                  className={`${s.pointGroup} ${dimmed ? s.pointDim : ""}`}
                  transform={`translate(${x},${y})`}
                  onMouseEnter={() => {
                    if (canHoverRef.current) setHoverRAF({ x, y, p });
                  }}
                  onMouseLeave={() => {
                    if (canHoverRef.current) setHoverRAF(null);
                  }}
                  onClick={() => {
                    setFocused({ p });
                    if (isMobile) setIsModalOpen(true);
                  }}
                  style={{ "--cat-color": palette[pCat] || "#111" }}
                >
                  {isHot && <circle className={s.pointHalo} r={r + 1} />}
                  <circle
                    className={s.point}
                    r={r}
                    filter="url(#shadow)"
                    fillOpacity={dotOpacity}
                  />
                  {/* keep the invisible hit area comfortably large */}
                  <circle
                    className={s.pointHit}
                    r={Math.max(12, dotRadius * 1)}
                  />
                </g>
              );
            })}

            {/* city labels */}
            <g className={s.cityLayer}>
              {cityLabels.map((c) => {
                if (!Number.isFinite(c.lon) || !Number.isFinite(c.lat))
                  return null;
                const xy = projection([c.lon, c.lat]);
                if (!xy) return null;
                const [x, y] = xy;
                return (
                  <g key={c.id} transform={`translate(${x},${y})`}>
                    <circle className={s.cityDot} r={1.8} />
                    <text className={s.cityText} x={5} y={3}>
                      {c.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
        <div className={s.hint}>
          Click a district to zoom • Double-click to reset
        </div>
      </div>

      {/* LEGEND */}
      <aside className={s.legend} aria-label="Category key">
        <div className={s.legendTitleRow}>
          <div className={s.legendTitle}>Key</div>
          <div className={s.legendTitleNote}>Data category</div>
        </div>
        {/* Optional clear pill */}
        {activeCat && (
          <button className={s.legendClear} onClick={() => setActiveCat(null)}>
            Show all
          </button>
        )}

        <div className={s.legendList}>
          {categories.map((c) => {
            const isActive = activeCat === c;
            const isDim = activeCat && !isActive;
            return (
              <div
                key={c}
                className={`${s.legendRow} ${
                  isActive ? s.legendRowActive : ""
                } ${isDim ? s.legendRowDim : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                onClick={() => toggleCategory(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCategory(c);
                  }
                }}
                title={isActive ? "Click to show all" : `Highlight: ${c}`}
              >
                <span
                  className={s.legendSwatch}
                  style={{ "--cat-color": palette[c] }}
                />
                <div className={s.legendCategory}>{c}</div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* MOBILE SHEET */}
      {isMobile &&
        isModalOpen &&
        focused &&
        createPortal(
          <div className={s.modalBackdrop} onClick={closeModal}>
            <div
              className={s.modalSheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby="venue-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={s.modalHandle} aria-hidden />

              {/* reuse your card content */}
              <div className={s.cardHeader}>
                <span
                  className={s.cardDot}
                  style={{
                    "--cat-color":
                      palette[getCategory(focused.p) ?? "Uncategorised"],
                  }}
                />
                <div id="venue-title" className={s.cardTitle}>
                  {focused.p.name}
                </div>
                <button
                  className={s.modalClose}
                  onClick={closeModal}
                  aria-label="Close"
                >
                  <img src={closeIcon} alt="Close" />
                </button>
              </div>

              <div className={s.cardBody}>
                <div className={s.cardMeta}>
                  {focused.p.type ? `${focused.p.type} · ` : ""}
                  {getCategory(focused.p) ?? "Uncategorised"}
                </div>
                {focused.p.description && (
                  <p className={s.cardText}>{focused.p.description}</p>
                )}
                {focused.p.website && (
                  <a
                    className={s.cardLink}
                    href={focused.p.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit website →
                  </a>
                )}
                <button
                  className={s.clearBtn}
                  onClick={() => {
                    setFocused(null);
                    closeModal();
                  }}
                >
                  Clear selection
                </button>
              </div>

              {focused.p.image && (
                <div className={s.cardImage}>
                  <img src={focused.p.image} alt="" />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
