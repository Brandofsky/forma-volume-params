import { useState, useEffect, useRef } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";

// ─── Color maps ───────────────────────────────────────────────────────────────
const FN_COLORS = {
  "3 Bedroom":  "#60A5FA",
  "2 Bedroom":  "#34D399",
  "1 Bedroom":  "#FBBF24",
  "Core":       "#F87171",
  "Corridor":   "#A78BFA",
  "Amenity":    "#FB923C",
};

const PHASE_COLORS = {
  "Phase 1": "#60A5FA",
  "Phase 2": "#FBBF24",
  "Phase 3": "#F87171",
  "Phase 4": "#34D399",
};

const MODES = [
  { id: "none",     label: "Default",  icon: "○", hint: "Forma's original colors" },
  { id: "function", label: "Function", icon: "◉", hint: "Color by bedroom / support type" },
  { id: "phase",    label: "Phase",    icon: "◈", hint: "Color by construction phase" },
  { id: "site",     label: "In Site",  icon: "◆", hint: "Highlight buildings counted in Matrix" },
];

export default function Visualize({ allBuildings, allData }) {
  const [mode,       setMode]       = useState("none");
  const [applying,   setApplying]   = useState(false);
  const [hiddenPhase, setHiddenPhase] = useState(null); // phase to isolate (hide others)
  const prevMode = useRef("none");

  // ── Apply or clear colors whenever mode or data changes ───────────────────
  useEffect(() => {
    let cancelled = false;

    async function apply() {
      setApplying(true);
      try {
        // Always clear first
        await Forma.render.elementColors.clearAll();
        await Forma.render.unhideAllElements();

        if (mode === "none" || allBuildings.length === 0) {
          setApplying(false);
          return;
        }

        const pathsToColor = new Map();

        if (mode === "function") {
          for (const b of allBuildings) {
            const fn = allData[b.path]?.function;
            const color = fn ? (FN_COLORS[fn] ?? "#94A3B8") : "#1E293B";
            pathsToColor.set(b.path, color);
          }
          await Forma.render.elementColors.set({ pathsToColor });

        } else if (mode === "phase") {
          for (const b of allBuildings) {
            const phase = allData[b.path]?.phase;
            const color = phase ? (PHASE_COLORS[phase] ?? "#94A3B8") : "#1E293B";
            pathsToColor.set(b.path, color);
          }
          await Forma.render.elementColors.set({ pathsToColor });

        } else if (mode === "site") {
          for (const b of allBuildings) {
            const inSite = allData[b.path]?.withinSite;
            pathsToColor.set(b.path, inSite ? "#34D399" : "#374151");
          }
          await Forma.render.elementColors.set({ pathsToColor });
        }

      } catch (e) {
        console.warn("[Visualize] render failed", e);
      }
      if (!cancelled) setApplying(false);
    }

    apply();
    prevMode.current = mode;

    return () => { cancelled = true; };
  }, [mode, allBuildings, allData]);

  // ── Phase isolation (hide/show) ───────────────────────────────────────────
  async function isolatePhase(phase) {
    const next = hiddenPhase === phase ? null : phase;
    setHiddenPhase(next);

    try {
      await Forma.render.unhideAllElements();
      if (next !== null) {
        const toHide = allBuildings
          .filter(b => allData[b.path]?.phase !== next)
          .map(b => b.path);
        if (toHide.length > 0) {
          await Forma.render.hideElementsBatch({ paths: toHide });
        }
      }
    } catch (e) {
      console.warn("[Visualize] isolate phase failed", e);
    }
  }

  // ── Reset everything when leaving tab ────────────────────────────────────
  // (Forma does this automatically when extension closes, but good UX to offer manually)
  async function resetAll() {
    setMode("none");
    setHiddenPhase(null);
    try {
      await Forma.render.elementColors.clearAll();
      await Forma.render.unhideAllElements();
    } catch (e) {
      console.warn("[Visualize] reset failed", e);
    }
  }

  // ── Derived data for legend ───────────────────────────────────────────────
  const usedFunctions = [...new Set(
    allBuildings.map(b => allData[b.path]?.function).filter(Boolean)
  )];
  const usedPhases = [...new Set(
    allBuildings.map(b => allData[b.path]?.phase).filter(Boolean)
  )].sort();
  const siteCount    = allBuildings.filter(b => allData[b.path]?.withinSite).length;
  const nonSiteCount = allBuildings.length - siteCount;
  const unassigned   = allBuildings.filter(b => !allData[b.path]?.function).length;

  if (allBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>◎</div>
        <div style={S.emptyTitle}>No buildings in proposal</div>
        <div style={S.emptyNote}>Add buildings in Forma to visualize them</div>
      </div>
    );
  }

  return (
    <div style={S.root}>

      {/* Mode selector */}
      <div style={S.section}>
        <div style={S.sectionLabel}>Color Mode</div>
        <div style={S.modeGrid}>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{ ...S.modeBtn, ...(mode === m.id ? S.modeBtnActive : {}) }}
            >
              <span style={S.modeIcon}>{m.icon}</span>
              <span style={S.modeLabel}>{m.label}</span>
            </button>
          ))}
        </div>
        {applying && <div style={S.applyingNote}>Applying…</div>}
        {!applying && mode !== "none" && (
          <div style={S.hintNote}>{MODES.find(m => m.id === mode)?.hint}</div>
        )}
      </div>

      {/* Legend — changes based on mode */}
      {mode === "function" && usedFunctions.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Function Legend</div>
          <div style={S.legendList}>
            {usedFunctions.map(fn => {
              const count = allBuildings.filter(b => allData[b.path]?.function === fn).length;
              return (
                <div key={fn} style={S.legendRow}>
                  <div style={{ ...S.swatch, background: FN_COLORS[fn] ?? "#94A3B8" }} />
                  <span style={S.legendName}>{fn}</span>
                  <span style={S.legendCount}>{count} bldg{count !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
            {unassigned > 0 && (
              <div style={S.legendRow}>
                <div style={{ ...S.swatch, background: "#1E293B", border: "1px solid #374151" }} />
                <span style={{ ...S.legendName, color: "#4B5563" }}>Unassigned</span>
                <span style={S.legendCount}>{unassigned}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "phase" && usedPhases.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Phase Legend</div>
          <div style={S.legendList}>
            {usedPhases.map(phase => {
              const count = allBuildings.filter(b => allData[b.path]?.phase === phase).length;
              const gfa   = allBuildings
                .filter(b => allData[b.path]?.phase === phase)
                .reduce((s, b) => s + b.gfaSF, 0);
              return (
                <div key={phase} style={S.legendRow}>
                  <div style={{ ...S.swatch, background: PHASE_COLORS[phase] ?? "#94A3B8" }} />
                  <span style={S.legendName}>{phase}</span>
                  <span style={S.legendCount}>{count} · {gfa > 0 ? `${(gfa/1000).toFixed(0)}k SF` : "—"}</span>
                </div>
              );
            })}
            {unassigned > 0 && (
              <div style={S.legendRow}>
                <div style={{ ...S.swatch, background: "#1E293B", border: "1px solid #374151" }} />
                <span style={{ ...S.legendName, color: "#4B5563" }}>Unassigned</span>
                <span style={S.legendCount}>{unassigned}</span>
              </div>
            )}
          </div>

          {/* Phase isolation — show only one phase at a time */}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 6 }}>Isolate Phase</div>
            <div style={S.phaseIsolateRow}>
              {usedPhases.map(phase => (
                <button
                  key={phase}
                  onClick={() => isolatePhase(phase)}
                  style={{
                    ...S.isolateBtn,
                    ...(hiddenPhase === phase ? S.isolateBtnActive : {}),
                    borderColor: PHASE_COLORS[phase] ?? "#374151",
                    color: hiddenPhase === phase ? "#fff" : (PHASE_COLORS[phase] ?? "#9CA3AF"),
                    background: hiddenPhase === phase ? (PHASE_COLORS[phase] ?? "#374151") + "33" : "transparent",
                  }}
                >
                  {phase.replace("Phase ", "P")}
                </button>
              ))}
              {hiddenPhase && (
                <button onClick={() => isolatePhase(hiddenPhase)} style={S.showAllBtn}>
                  Show all
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "site" && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Site Limit Legend</div>
          <div style={S.legendList}>
            <div style={S.legendRow}>
              <div style={{ ...S.swatch, background: "#34D399" }} />
              <span style={S.legendName}>Within Site</span>
              <span style={S.legendCount}>{siteCount} bldgs</span>
            </div>
            <div style={S.legendRow}>
              <div style={{ ...S.swatch, background: "#374151" }} />
              <span style={S.legendName}>Outside Site</span>
              <span style={S.legendCount}>{nonSiteCount} bldgs</span>
            </div>
          </div>
        </div>
      )}

      {/* Building list — small summary of all buildings */}
      <div style={S.section}>
        <div style={S.sectionLabel}>All Buildings ({allBuildings.length})</div>
        <div style={S.buildingList}>
          {allBuildings.map(b => {
            const d     = allData[b.path];
            const fn    = d?.function;
            const phase = d?.phase;
            const dot   = mode === "function" ? (FN_COLORS[fn] ?? (fn ? "#94A3B8" : "#1F2937"))
                        : mode === "phase"    ? (PHASE_COLORS[phase] ?? (phase ? "#94A3B8" : "#1F2937"))
                        : mode === "site"     ? (d?.withinSite ? "#34D399" : "#374151")
                        : "#374151";
            return (
              <div key={b.path} style={S.bldgRow}>
                <div style={{ ...S.bldgDot, background: dot }} />
                <div style={S.bldgInfo}>
                  <span style={S.bldgFn}>{fn ?? <span style={{ color: "#374151" }}>unassigned</span>}</span>
                  <span style={S.bldgMeta}>{b.floors}fl · {phase ?? "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset button */}
      {mode !== "none" && (
        <div style={{ padding: "0 12px 20px" }}>
          <button onClick={resetAll} style={S.resetBtn}>
            Reset to Default Colors
          </button>
        </div>
      )}
    </div>
  );
}

const S = {
  root:            { display: "flex", flexDirection: "column", paddingBottom: 24 },
  empty:           { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, textAlign: "center" },
  emptyIcon:       { fontSize: 32, opacity: 0.15 },
  emptyTitle:      { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  emptyNote:       { fontSize: 12, color: "#4B5563" },
  section:         { padding: "14px 12px 0" },
  sectionLabel:    { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 8 },
  modeGrid:        { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 },
  modeBtn:         { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 4px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, background: "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.15s" },
  modeBtnActive:   { background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.4)" },
  modeIcon:        { fontSize: 16, color: "#60A5FA" },
  modeLabel:       { fontSize: 10, color: "#9CA3AF", fontWeight: 600 },
  applyingNote:    { fontSize: 10, color: "#4B5563", fontStyle: "italic", marginTop: 6, textAlign: "center" },
  hintNote:        { fontSize: 10, color: "#4B5563", fontStyle: "italic", marginTop: 6, textAlign: "center" },
  legendList:      { display: "flex", flexDirection: "column", gap: 6 },
  legendRow:       { display: "flex", alignItems: "center", gap: 8 },
  swatch:          { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  legendName:      { flex: 1, fontSize: 12, color: "#E2E8F0" },
  legendCount:     { fontSize: 11, color: "#6B7280", fontFamily: "monospace" },
  phaseIsolateRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  isolateBtn:      { padding: "5px 10px", border: "1px solid", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  isolateBtnActive:{ fontWeight: 700 },
  showAllBtn:      { padding: "5px 10px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, fontSize: 11, color: "#6B7280", background: "transparent", cursor: "pointer" },
  buildingList:    { display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" },
  bldgRow:         { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  bldgDot:         { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, transition: "background 0.3s" },
  bldgInfo:        { flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" },
  bldgFn:          { fontSize: 11, color: "#E2E8F0" },
  bldgMeta:        { fontSize: 10, color: "#6B7280", fontFamily: "monospace" },
  resetBtn:        { width: "100%", marginTop: 14, padding: "8px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" },
};
