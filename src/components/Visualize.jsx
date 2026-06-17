import { useState, useEffect } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";

const UNIT_KEYWORDS = ["bedroom", "bed", "br", "studio", "unit", "residential", "apartment", "living"];
function isUnit(name = "") { return UNIT_KEYWORDS.some(k => name.toLowerCase().includes(k)); }

// ─── Color maps ───────────────────────────────────────────────────────────────
const PHASE_COLORS = {
  "Phase 1": "#60A5FA", "Phase 2": "#FBBF24",
  "Phase 3": "#F87171", "Phase 4": "#34D399",
};

// Get a building's color for a given mode, from its live Forma function colors
function getBuildingColor(b, allData, mode) {
  if (mode === "function") {
    // Color by dominant function (most GFA)
    const bds = b.breakdown ?? [];
    if (bds.length === 0) return "#1E293B";
    const dominant = bds.reduce((max, fn) => fn.gfaSF > max.gfaSF ? fn : max, bds[0]);
    return dominant.functionColor ?? "#94A3B8";
  }
  if (mode === "phase") {
    const phase = allData[b.path]?.phase;
    return phase ? (PHASE_COLORS[phase] ?? "#94A3B8") : "#1E293B";
  }
  if (mode === "site") {
    return allData[b.path]?.withinSite ? "#34D399" : "#374151";
  }
  return null;
}

const MODES = [
  { id: "none",     label: "Default",  icon: "○" },
  { id: "function", label: "Function", icon: "◉" },
  { id: "phase",    label: "Phase",    icon: "◈" },
  { id: "site",     label: "In Site",  icon: "◆" },
];

export default function Visualize({ allBuildings, allData }) {
  const [mode,        setMode]        = useState("none");
  const [applying,    setApplying]    = useState(false);
  const [hiddenPhase, setHiddenPhase] = useState(null);
  const [bedroomOnly, setBedroomOnly] = useState(false);

  // ── Which buildings have at least one bedroom unit ────────────────────────
  function hasBedroomUnit(b) {
    const fns = b.floorFunctions ?? [];
    return fns.some(fset => [...fset].some(isUnit));
  }

  // ── Apply colors + bedroom filter whenever anything changes ───────────────
  useEffect(() => {
    let cancelled = false;
    async function apply() {
      setApplying(true);
      try {
        await Forma.render.elementColors.clearAll();
        await Forma.render.unhideAllElements();

        if (allBuildings.length === 0) { setApplying(false); return; }

        // Bedroom-only filter: hide buildings with zero bedroom floors
        if (bedroomOnly) {
          const toHide = allBuildings
            .filter(b => !hasBedroomUnit(b))
            .map(b => b.path);
          if (toHide.length > 0) {
            await Forma.render.hideElementsBatch({ paths: toHide });
          }
        }

        // Phase isolation (overrides bedroom filter for visibility)
        if (hiddenPhase) {
          const toHide = allBuildings
            .filter(b => allData[b.path]?.phase !== hiddenPhase)
            .map(b => b.path);
          if (toHide.length > 0) {
            await Forma.render.hideElementsBatch({ paths: toHide });
          }
        }

        // Color mode
        if (mode !== "none") {
          const pathsToColor = new Map();
          for (const b of allBuildings) {
            const color = getBuildingColor(b, allData, mode);
            if (color) pathsToColor.set(b.path, color);
          }
          if (pathsToColor.size > 0) {
            await Forma.render.elementColors.set({ pathsToColor });
          }
        }
      } catch (e) {
        console.warn("[Visualize] render failed", e);
      }
      if (!cancelled) setApplying(false);
    }
    apply();
    return () => { cancelled = true; };
  }, [mode, allBuildings, allData, hiddenPhase, bedroomOnly]);

  async function reset() {
    setMode("none");
    setHiddenPhase(null);
    setBedroomOnly(false);
    try {
      await Forma.render.elementColors.clearAll();
      await Forma.render.unhideAllElements();
    } catch (e) { console.warn("[Visualize] reset failed", e); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const usedPhases   = [...new Set(allBuildings.map(b => allData[b.path]?.phase).filter(Boolean))].sort();
  const bedroomBldgs = allBuildings.filter(hasBedroomUnit);
  const nonBdrm      = allBuildings.length - bedroomBldgs.length;

  // Collect all unique functions across all buildings
  const allFnNames = new Set();
  for (const b of allBuildings) {
    for (const fset of (b.floorFunctions ?? [])) {
      for (const fn of fset) allFnNames.add(fn);
    }
  }

  function getFnColor(fnName) {
    for (const b of allBuildings) {
      const color = b.fnMeta?.[fnName]?.functionColor;
      if (color) return color;
    }
    return "#94A3B8";
  }

  if (allBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>◎</div>
        <div style={S.emptyTitle}>No buildings in proposal</div>
      </div>
    );
  }

  return (
    <div style={S.root}>

      {/* ── Bedroom-only filter — primary feature ── */}
      <div style={S.bedroomCard}>
        <div style={S.bedroomLeft}>
          <div style={{ fontSize: 12, fontWeight: 700, color: bedroomOnly ? "#34D399" : "#E2E8F0" }}>
            Show Bedroom Units Only
          </div>
          <div style={{ fontSize: 10, color: "#4B5563", marginTop: 2 }}>
            {bedroomBldgs.length} buildings with bedrooms · {nonBdrm} support-only hidden
          </div>
        </div>
        <div onClick={() => setBedroomOnly(v => !v)} style={{ ...S.toggle, background: bedroomOnly ? "#22C55E" : "#374151" }}>
          <div style={{ ...S.thumb, transform: bedroomOnly ? "translateX(18px)" : "translateX(2px)" }} />
        </div>
      </div>

      {/* ── Color mode ── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Color Mode {applying && <span style={{ color: "#4B5563" }}>· applying…</span>}</div>
        <div style={S.modeGrid}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ ...S.modeBtn, ...(mode === m.id ? S.modeBtnActive : {}) }}>
              <span style={S.modeIcon}>{m.icon}</span>
              <span style={S.modeLabel}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Function legend (mode = function) ── */}
      {mode === "function" && allFnNames.size > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Function Legend</div>
          <div style={S.legendList}>
            {[...allFnNames].map(fn => {
              const color = getFnColor(fn);
              const count = allBuildings.filter(b =>
                (b.floorFunctions ?? []).some(fset => fset.has(fn))
              ).length;
              return (
                <div key={fn} style={S.legendRow}>
                  <div style={{ ...S.swatch, background: color }} />
                  <span style={S.legendName}>{fn}</span>
                  <span style={S.legendCount}>{count} bldg{count !== 1 ? "s" : ""}</span>
                  {!isUnit(fn) && <span style={{ fontSize: 9, color: "#4B5563" }}>support</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: "#374151", marginTop: 8 }}>
            Color shows dominant function by GFA
          </div>
        </div>
      )}

      {/* ── Phase legend + isolation (mode = phase) ── */}
      {mode === "phase" && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Phase Legend</div>
          <div style={S.legendList}>
            {usedPhases.map(phase => {
              const pb  = allBuildings.filter(b => allData[b.path]?.phase === phase);
              const gfa = pb.reduce((s, b) => s + b.gfaSF, 0);
              return (
                <div key={phase} style={S.legendRow}>
                  <div style={{ ...S.swatch, background: PHASE_COLORS[phase] ?? "#94A3B8" }} />
                  <span style={S.legendName}>{phase}</span>
                  <span style={S.legendCount}>{pb.length} bldgs · {gfa > 0 ? `${(gfa/1000).toFixed(0)}k SF` : "—"}</span>
                </div>
              );
            })}
          </div>
          {usedPhases.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...S.sectionLabel, marginBottom: 6 }}>Isolate Phase</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {usedPhases.map(phase => (
                  <button key={phase}
                    onClick={() => setHiddenPhase(prev => prev === phase ? null : phase)}
                    style={{
                      padding: "5px 10px", border: `1px solid ${PHASE_COLORS[phase] ?? "#374151"}`,
                      borderRadius: 5, fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                      color: hiddenPhase === phase ? "#fff" : (PHASE_COLORS[phase] ?? "#9CA3AF"),
                      background: hiddenPhase === phase ? `${PHASE_COLORS[phase]}33` : "transparent",
                      fontWeight: hiddenPhase === phase ? 700 : 400,
                    }}>
                    {phase.replace("Phase ", "P")}
                  </button>
                ))}
                {hiddenPhase && (
                  <button onClick={() => setHiddenPhase(null)}
                    style={{ padding: "5px 10px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, fontSize: 11, color: "#6B7280", background: "transparent", cursor: "pointer" }}>
                    Show all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Site legend (mode = site) ── */}
      {mode === "site" && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Site Limit</div>
          <div style={S.legendList}>
            <div style={S.legendRow}>
              <div style={{ ...S.swatch, background: "#34D399" }} />
              <span style={S.legendName}>Within Site</span>
              <span style={S.legendCount}>{allBuildings.filter(b => allData[b.path]?.withinSite).length}</span>
            </div>
            <div style={S.legendRow}>
              <div style={{ ...S.swatch, background: "#374151" }} />
              <span style={S.legendName}>Outside Site</span>
              <span style={S.legendCount}>{allBuildings.filter(b => !allData[b.path]?.withinSite).length}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Building list ── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>All Buildings ({allBuildings.length})</div>
        <div style={S.buildingList}>
          {allBuildings.map(b => {
            const d          = allData[b.path];
            const isBedroom  = hasBedroomUnit(b);
            const isHidden   = bedroomOnly && !isBedroom;
            const dot        = getBuildingColor(b, allData, mode) ?? "#374151";
            const fns        = [...new Set((b.floorFunctions ?? []).flatMap(fset => [...fset]))];
            return (
              <div key={b.path} style={{ ...S.bldgRow, opacity: isHidden ? 0.3 : 1 }}>
                <div style={{ ...S.bldgDot, background: dot }} />
                <div style={S.bldgInfo}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {fns.map(fn => (
                      <span key={fn} style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: `${getFnColor(fn)}22`,
                        color: getFnColor(fn), border: `1px solid ${getFnColor(fn)}44`,
                      }}>{fn}</span>
                    ))}
                  </div>
                  <span style={S.bldgMeta}>{b.floors}fl · {d?.phase ?? "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(mode !== "none" || bedroomOnly || hiddenPhase) && (
        <div style={{ padding: "0 12px 20px" }}>
          <button onClick={reset} style={S.resetBtn}>Reset to Default</button>
        </div>
      )}
    </div>
  );
}

const S = {
  root:         { display: "flex", flexDirection: "column", paddingBottom: 24 },
  empty:        { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10 },
  emptyIcon:    { fontSize: 32, opacity: 0.15 },
  emptyTitle:   { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  bedroomCard:  { margin: "12px 12px 0", background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  bedroomLeft:  { flex: 1 },
  toggle:       { width: 38, height: 22, borderRadius: 11, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 },
  thumb:        { position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  section:      { padding: "14px 12px 0" },
  sectionLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 8 },
  modeGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 },
  modeBtn:      { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, background: "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.15s" },
  modeBtnActive:{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.4)" },
  modeIcon:     { fontSize: 16, color: "#60A5FA" },
  modeLabel:    { fontSize: 10, color: "#9CA3AF", fontWeight: 600 },
  legendList:   { display: "flex", flexDirection: "column", gap: 6 },
  legendRow:    { display: "flex", alignItems: "center", gap: 8 },
  swatch:       { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  legendName:   { flex: 1, fontSize: 12, color: "#E2E8F0" },
  legendCount:  { fontSize: 11, color: "#6B7280", fontFamily: "monospace" },
  buildingList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" },
  bldgRow:      { display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "opacity 0.2s" },
  bldgDot:      { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 3, transition: "background 0.3s" },
  bldgInfo:     { flex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 },
  bldgMeta:     { fontSize: 10, color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap" },
  resetBtn:     { width: "100%", marginTop: 14, padding: "8px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" },
};
