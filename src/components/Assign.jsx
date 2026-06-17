import { useState, useEffect } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";

// ─── Constants ────────────────────────────────────────────────────────────────
const PHASES = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];

// Default cost suggestions per function name (fallback if name matches)
const COST_SUGGESTIONS = {
  "3 bedroom": 220, "3bed": 220, "3br": 220,
  "2 bedroom": 200, "2bed": 200, "2br": 200,
  "1 bedroom": 185, "1bed": 185, "1br": 185,
  "studio":    170,
  "core":       95, "stair": 95, "elevator": 95,
  "corridor":   80, "hallway": 80, "circulation": 80,
  "amenity":   160, "retail": 175, "commercial": 175,
};

function suggestCost(name = "") {
  const key = name.toLowerCase().trim();
  for (const [k, v] of Object.entries(COST_SUGGESTIONS)) {
    if (key.includes(k)) return String(v);
  }
  return "";
}

// ─── Read function breakdown from Forma areaMetrics ───────────────────────────
// Returns: [{ functionId, functionName, functionColor, gfaM2, gfaSF }]
// Uses areaMetrics.grossFloorArea.functionBreakdown — already split per function by Forma
async function readFunctionBreakdown(path) {
  try {
    const result = await Forma.areaMetrics.calculate({ paths: [path] });
    const breakdown = result?.builtInMetrics?.grossFloorArea?.functionBreakdown ?? [];
    return breakdown
      .filter(fb => typeof fb.value === "number" && fb.value > 0)
      .map(fb => ({
        functionId:    fb.functionId,
        functionName:  fb.functionName,
        functionColor: fb.functionColor ?? "#60A5FA",
        gfaM2:         fb.value,
        gfaSF:         Math.round(fb.value * 10.764),
      }));
  } catch (e) {
    console.warn("[Forma] readFunctionBreakdown failed", e);
    return [];
  }
}

// ─── Data shape ───────────────────────────────────────────────────────────────
// Stored per building path in localStorage:
// {
//   withinSite: boolean,
//   phase: "Phase 1" | ...,
//   functions: {
//     [functionId]: { costPerSF: string }
//   }
// }
function emptyBuildingData() {
  return { withinSite: false, phase: "Phase 1", functions: {} };
}

export default function Assign({ selected, allData, onSave }) {
  const [breakdown,  setBreakdown]  = useState([]);   // from Forma areaMetrics
  const [form,       setForm]       = useState(emptyBuildingData());
  const [loading,    setLoading]    = useState(false);
  const [toast,      setToast]      = useState(null);

  // When selected building changes → load saved data + fetch live function breakdown
  useEffect(() => {
    if (!selected) { setBreakdown([]); setForm(emptyBuildingData()); return; }

    const saved = allData[selected.path];
    setForm(saved ? { ...emptyBuildingData(), ...saved } : emptyBuildingData());

    // Fetch live function breakdown from Forma
    setLoading(true);
    readFunctionBreakdown(selected.path).then(fns => {
      setBreakdown(fns);

      // Auto-populate cost suggestions for any function not yet saved
      if (fns.length > 0) {
        setForm(prev => {
          const updated = { ...prev };
          for (const fn of fns) {
            if (!updated.functions[fn.functionId]?.costPerSF) {
              const suggestion = suggestCost(fn.functionName);
              if (suggestion) {
                updated.functions = {
                  ...updated.functions,
                  [fn.functionId]: { costPerSF: suggestion },
                };
              }
            }
          }
          return updated;
        });
      }
      setLoading(false);
    });
  }, [selected?.path]);

  function handleCostChange(functionId, costPerSF) {
    setForm(prev => ({
      ...prev,
      functions: { ...prev.functions, [functionId]: { costPerSF } },
    }));
  }

  function handlePhase(phase) {
    setForm(prev => ({ ...prev, phase }));
  }

  function handleToggleSite() {
    setForm(prev => ({ ...prev, withinSite: !prev.withinSite }));
  }

  function handleSave() {
    if (!selected) return;
    onSave(selected.path, form);
    showToast("Saved ✓");
  }

  function handleClear() {
    if (!selected) return;
    onSave(selected.path, null);
    setForm(emptyBuildingData());
    showToast("Cleared");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalGFASF = breakdown.reduce((s, fn) => s + fn.gfaSF, 0);
  const totalCost  = breakdown.reduce((s, fn) => {
    const cost = parseFloat(form.functions[fn.functionId]?.costPerSF) || 0;
    return s + fn.gfaSF * cost;
  }, 0);
  const isSaved = selected && !!allData[selected.path];

  // ── No selection ─────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No building selected</div>
        <div style={S.emptyNote}>
          Click any building in Forma, then assign functions to its floors
          using the floor plan editor on the right panel before coming here.
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>

      {/* Building stats */}
      <div style={S.statsCard}>
        <div style={S.statsLabel}>Live from Forma</div>
        <div style={S.statsGrid}>
          <Stat label="Floors"    value={selected.floors} />
          <Stat label="Total GFA" value={totalGFASF > 0 ? `${totalGFASF.toLocaleString()} SF` : `${selected.gfaSF.toLocaleString()} SF`} />
          <Stat label="Footprint" value={`${selected.footprintSF.toLocaleString()} SF`} />
          <Stat label="Height"    value={`${selected.heightFt} ft`} />
        </div>
        <div style={S.pathLabel}>{selected.path.split("/").pop()}</div>
      </div>

      <div style={S.form}>

        {/* Function breakdown from Forma — one row per function */}
        <Field label="Functions from Forma">
          {loading && (
            <div style={S.loadingNote}>Reading floor functions…</div>
          )}

          {!loading && breakdown.length === 0 && (
            <div style={S.noFunctions}>
              <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.6 }}>
                No functions detected on this building.
              </div>
              <div style={{ fontSize: 11, color: "#374151", marginTop: 4 }}>
                In Forma's right panel → Building → Floor Plans → assign functions to floors, then return here.
              </div>
            </div>
          )}

          {!loading && breakdown.length > 0 && (
            <div style={S.fnList}>
              {breakdown.map(fn => {
                const costStr = form.functions[fn.functionId]?.costPerSF ?? "";
                const cost    = parseFloat(costStr) || 0;
                const subtotal = fn.gfaSF * cost;
                const pct     = totalGFASF > 0 ? Math.round((fn.gfaSF / totalGFASF) * 100) : 0;

                return (
                  <div key={fn.functionId} style={S.fnRow}>
                    {/* Function header */}
                    <div style={S.fnHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: fn.functionColor, flexShrink: 0 }} />
                        <span style={S.fnName}>{fn.functionName}</span>
                      </div>
                      <span style={S.fnGfa}>
                        {fn.gfaSF.toLocaleString()} SF
                        <span style={{ color: "#4B5563", marginLeft: 4 }}>({pct}%)</span>
                      </span>
                    </div>

                    {/* GFA bar */}
                    <div style={S.fnBar}>
                      <div style={{ ...S.fnBarFill, width: `${pct}%`, background: fn.functionColor }} />
                    </div>

                    {/* Cost input */}
                    <div style={S.fnCostRow}>
                      <span style={S.costLabel}>Cost / SF</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={S.prefix}>$</span>
                        <input
                          type="number"
                          value={costStr}
                          onChange={e => handleCostChange(fn.functionId, e.target.value)}
                          placeholder="0"
                          style={S.costInput}
                        />
                        <span style={S.suffix}>/SF</span>
                      </div>
                      {subtotal > 0 && (
                        <span style={S.subtotal}>${Math.round(subtotal).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total cost row */}
              {totalCost > 0 && (
                <div style={S.totalRow}>
                  <span style={S.totalLabel}>Total Cost</span>
                  <span style={S.totalVal}>${Math.round(totalCost).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </Field>

        {/* Phase — applies to whole building */}
        <Field label="Phase">
          <div style={{ display: "flex", gap: 5 }}>
            {PHASES.map(p => (
              <button
                key={p}
                onClick={() => handlePhase(p)}
                style={{ ...S.phaseBtn, ...(form.phase === p ? S.phaseActive : {}) }}
              >
                {p.replace("Phase ", "P")}
              </button>
            ))}
          </div>
        </Field>

        {/* Within site */}
        <Field label="Within Site Limit">
          <div onClick={handleToggleSite} style={S.toggleRow}>
            <div style={{ ...S.track, background: form.withinSite ? "#22C55E" : "#374151" }}>
              <div style={{ ...S.thumb, transform: form.withinSite ? "translateX(18px)" : "translateX(2px)" }} />
            </div>
            <span style={{ color: form.withinSite ? "#34D399" : "#6B7280", fontSize: 12 }}>
              {form.withinSite ? "Yes — counted in Matrix" : "No — excluded from Matrix"}
            </span>
          </div>
        </Field>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} style={S.saveBtn}>Save to Element</button>
          {isSaved && <button onClick={handleClear} style={S.clearBtn}>Clear</button>}
        </div>

        {isSaved && (
          <div style={S.savedBadge}>
            <span style={{ color: "#34D399" }}>✓</span> Parameters saved
            {form.withinSite && <span style={S.inSiteTag}>IN SITE</span>}
          </div>
        )}
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9CA3AF", fontFamily: "monospace" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const S = {
  root:        { display: "flex", flexDirection: "column" },
  empty:       { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, padding: 24, textAlign: "center" },
  emptyIcon:   { fontSize: 32, opacity: 0.15 },
  emptyTitle:  { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  emptyNote:   { fontSize: 12, color: "#4B5563", lineHeight: 1.6 },
  statsCard:   { margin: "12px 14px 0", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 12px" },
  statsLabel:  { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#60A5FA", fontFamily: "monospace", marginBottom: 10 },
  statsGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 },
  pathLabel:   { fontSize: 9, color: "#374151", fontFamily: "monospace", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  form:        { padding: "12px 14px 24px", display: "flex", flexDirection: "column", gap: 16 },
  loadingNote: { fontSize: 11, color: "#4B5563", fontStyle: "italic", padding: "8px 0" },
  noFunctions: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7, padding: "12px 14px" },
  fnList:      { display: "flex", flexDirection: "column", gap: 10 },
  fnRow:       { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 },
  fnHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fnName:      { fontSize: 12, fontWeight: 600, color: "#E2E8F0" },
  fnGfa:       { fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" },
  fnBar:       { height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 },
  fnBarFill:   { height: "100%", borderRadius: 2, opacity: 0.6, transition: "width 0.3s" },
  fnCostRow:   { display: "flex", alignItems: "center", gap: 8 },
  costLabel:   { fontSize: 10, color: "#6B7280", width: 46, flexShrink: 0 },
  costInput:   { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#E2E8F0", fontSize: 12, padding: "5px 8px", outline: "none", width: 60, fontFamily: "monospace" },
  prefix:      { color: "#6B7280", fontSize: 12 },
  suffix:      { color: "#6B7280", fontSize: 10 },
  subtotal:    { marginLeft: "auto", fontSize: 11, color: "#34D399", fontFamily: "monospace", fontWeight: 600 },
  totalRow:    { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, marginTop: 2 },
  totalLabel:  { fontSize: 11, color: "#9CA3AF" },
  totalVal:    { fontSize: 13, fontWeight: 700, color: "#34D399", fontFamily: "monospace" },
  phaseBtn:    { flex: 1, padding: "6px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: "rgba(255,255,255,0.03)", color: "#9CA3AF", fontSize: 11, cursor: "pointer", transition: "all 0.12s" },
  phaseActive: { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24", fontWeight: 600 },
  toggleRow:   { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  track:       { width: 38, height: 22, borderRadius: 11, position: "relative", transition: "background 0.2s", flexShrink: 0 },
  thumb:       { position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  saveBtn:     { flex: 1, background: "linear-gradient(135deg,#2563EB,#1D4ED8)", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer" },
  clearBtn:    { padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" },
  savedBadge:  { display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#6B7280", padding: "6px 10px", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 6 },
  inSiteTag:   { marginLeft: "auto", fontSize: 9, color: "#34D399", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.07em" },
  toast:       { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#1E293B", border: "1px solid rgba(96,165,250,0.3)", color: "#60A5FA", borderRadius: 7, padding: "8px 18px", fontSize: 12, fontWeight: 600, fontFamily: "monospace", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", whiteSpace: "nowrap" },
};
