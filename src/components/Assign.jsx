import { useState, useEffect } from "react";

const FUNCTIONS = ["3 Bedroom", "2 Bedroom", "1 Bedroom", "Core", "Corridor", "Amenity"];
const PHASES    = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
const SECTORS   = ["Affordable Housing"];

// $/SF defaults by function type
const COST_DEFAULTS = {
  "3 Bedroom": 220,
  "2 Bedroom": 200,
  "1 Bedroom": 185,
  "Core":       95,
  "Corridor":   80,
  "Amenity":   160,
};

function emptyForm() {
  return { sector: "Affordable Housing", function: "", costPerSF: "", phase: "Phase 1", withinSite: false };
}

export default function Assign({ elements, allData, onSave }) {
  const [selectedPath, setSelected] = useState(elements[0]?.path || null);
  const [form, setForm]             = useState(emptyForm());
  const [toast, setToast]           = useState(null);

  const selected = elements.find((e) => e.path === selectedPath);

  // Load saved data when selection changes
  useEffect(() => {
    if (!selectedPath) return;
    const saved = allData[selectedPath];
    setForm(saved ? { ...emptyForm(), ...saved } : emptyForm());
  }, [selectedPath, allData]);

  function handleChange(key, val) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // Auto-suggest cost when function changes (only if cost not manually set)
      if (key === "function" && !allData[selectedPath]?.costPerSF) {
        next.costPerSF = COST_DEFAULTS[val] || "";
      }
      return next;
    });
  }

  function handleSave() {
    if (!selectedPath) return;
    if (!form.function) { showToast("⚠ Select a function first"); return; }
    onSave(selectedPath, form);
    showToast("Saved ✓");
  }

  function handleClear() {
    setForm(emptyForm());
    onSave(selectedPath, null);
    showToast("Cleared");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const area      = selected?.floors || 0; // 1 unit/floor so units = floors
  const costPerSF = parseFloat(form.costPerSF) || 0;
  // Approximate unit SF by function
  const unitSF    = { "3 Bedroom": 1100, "2 Bedroom": 850, "1 Bedroom": 650, "Core": 400, "Corridor": 200, "Amenity": 1200 };
  const sfPerUnit = unitSF[form.function] || 0;
  const totalSF   = area * sfPerUnit;
  const totalCost = totalSF * costPerSF;

  const savedData    = allData[selectedPath];
  const assignedCount = Object.values(allData).filter((d) => d?.function).length;

  return (
    <div style={S.root}>

      {/* Progress bar */}
      <div style={S.progressBar}>
        <div style={S.progressLabel}>
          {assignedCount} of {elements.length} elements assigned
        </div>
        <div style={S.progressTrack}>
          <div style={{
            ...S.progressFill,
            width: `${(assignedCount / elements.length) * 100}%`,
          }} />
        </div>
      </div>

      {/* Element list */}
      <div style={S.listSection}>
        <div style={S.sectionLabel}>Elements</div>
        <div style={S.list}>
          {elements.map((el) => {
            const saved   = allData[el.path];
            const isSelected = el.path === selectedPath;
            return (
              <div
                key={el.path}
                onClick={() => setSelected(el.path)}
                style={{
                  ...S.row,
                  background: isSelected ? "rgba(96,165,250,0.1)" : "transparent",
                  borderLeft: `2px solid ${isSelected ? "#60A5FA" : "transparent"}`,
                }}
              >
                <div style={S.rowLeft}>
                  {/* Status dot */}
                  <div style={{
                    ...S.dot,
                    background: saved?.withinSite
                      ? "#34D399"
                      : saved?.function
                        ? "#FBBF24"
                        : "#374151",
                  }} />
                  <div>
                    <div style={S.rowName}>{el.name}</div>
                    <div style={S.rowMeta}>
                      {el.floors} floors
                      {saved?.function ? ` · ${saved.function}` : " · unassigned"}
                    </div>
                  </div>
                </div>
                {saved?.withinSite && (
                  <div style={S.siteTag}>IN SITE</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form */}
      {selected && (
        <div style={S.form}>
          <div style={S.sectionLabel}>
            Assign — <span style={{ color: "#60A5FA" }}>{selected.name}</span>
            <span style={{ color: "#4B5563", marginLeft: 6 }}>({selected.floors} floors)</span>
          </div>

          {/* Sector */}
          <Field label="Sector">
            <select value={form.sector} onChange={(e) => handleChange("sector", e.target.value)} style={S.input}>
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>

          {/* Function */}
          <Field label="Function">
            <div style={S.functionGrid}>
              {FUNCTIONS.map((fn) => (
                <button
                  key={fn}
                  onClick={() => handleChange("function", fn)}
                  style={{
                    ...S.fnBtn,
                    ...(form.function === fn ? S.fnBtnActive : {}),
                  }}
                >
                  {fn}
                </button>
              ))}
            </div>
          </Field>

          {/* Cost / SF */}
          <Field label="Cost / SF" hint="auto-suggested">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#6B7280" }}>$</span>
              <input
                type="number"
                value={form.costPerSF}
                onChange={(e) => handleChange("costPerSF", e.target.value)}
                placeholder="0"
                style={{ ...S.input, flex: 1 }}
              />
              <span style={{ color: "#6B7280", fontSize: 11 }}>/SF</span>
            </div>
          </Field>

          {/* Phase */}
          <Field label="Phase">
            <div style={S.phaseRow}>
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => handleChange("phase", p)}
                  style={{
                    ...S.phaseBtn,
                    ...(form.phase === p ? S.phaseBtnActive : {}),
                  }}
                >
                  {p.replace("Phase ", "P")}
                </button>
              ))}
            </div>
          </Field>

          {/* Within site toggle */}
          <Field label="Within Site Limit">
            <div
              onClick={() => handleChange("withinSite", !form.withinSite)}
              style={S.toggle}
            >
              <div style={{
                ...S.toggleTrack,
                background: form.withinSite ? "#22C55E" : "#374151",
              }}>
                <div style={{
                  ...S.toggleThumb,
                  transform: form.withinSite ? "translateX(18px)" : "translateX(2px)",
                }} />
              </div>
              <span style={{ color: form.withinSite ? "#34D399" : "#6B7280", fontSize: 12 }}>
                {form.withinSite ? "Yes — included in matrix" : "No — excluded from matrix"}
              </span>
            </div>
          </Field>

          {/* Cost summary */}
          {form.function && costPerSF > 0 && (
            <div style={S.costCard}>
              <div style={S.costRow}>
                <span style={S.costKey}>Units (= floors)</span>
                <span style={S.costVal}>{selected.floors}</span>
              </div>
              <div style={S.costRow}>
                <span style={S.costKey}>Est. SF/unit ({form.function})</span>
                <span style={S.costVal}>{sfPerUnit.toLocaleString()} SF</span>
              </div>
              <div style={S.costRow}>
                <span style={S.costKey}>Total SF</span>
                <span style={S.costVal}>{totalSF.toLocaleString()} SF</span>
              </div>
              <div style={{ ...S.costRow, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8, marginTop: 4 }}>
                <span style={S.costKey}>Total Cost</span>
                <span style={{ ...S.costVal, color: "#34D399", fontWeight: 700 }}>
                  ${Math.round(totalCost).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} style={S.saveBtn}>Save</button>
            {savedData && (
              <button onClick={handleClear} style={S.clearBtn}>Clear</button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9CA3AF", fontFamily: "monospace" }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 10, color: "#4B5563" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const S = {
  root:          { display: "flex", flexDirection: "column", gap: 0 },
  progressBar:   { padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  progressLabel: { fontSize: 10, color: "#6B7280", fontFamily: "monospace", marginBottom: 5 },
  progressTrack: { height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 },
  progressFill:  { height: "100%", background: "#60A5FA", borderRadius: 2, transition: "width 0.3s" },
  listSection:   { padding: "10px 0 0" },
  sectionLabel:  { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", padding: "0 14px 6px" },
  list:          { maxHeight: "28vh", overflowY: "auto" },
  row:           { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 14px", cursor: "pointer", transition: "all 0.1s" },
  rowLeft:       { display: "flex", alignItems: "center", gap: 8 },
  dot:           { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  rowName:       { fontSize: 12, color: "#E2E8F0", fontFamily: "monospace" },
  rowMeta:       { fontSize: 10, color: "#6B7280", marginTop: 1 },
  siteTag:       { fontSize: 9, color: "#34D399", fontFamily: "monospace", letterSpacing: "0.08em", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 3, padding: "1px 5px" },
  form:          { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid rgba(255,255,255,0.06)" },
  input:         { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#E2E8F0", fontSize: 13, padding: "7px 10px", outline: "none", width: "100%", fontFamily: "Inter, sans-serif", boxSizing: "border-box" },
  functionGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 },
  fnBtn:         { padding: "6px 4px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: "rgba(255,255,255,0.03)", color: "#9CA3AF", fontSize: 11, cursor: "pointer", transition: "all 0.15s" },
  fnBtnActive:   { background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", color: "#60A5FA", fontWeight: 600 },
  phaseRow:      { display: "flex", gap: 5 },
  phaseBtn:      { flex: 1, padding: "6px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: "rgba(255,255,255,0.03)", color: "#9CA3AF", fontSize: 11, cursor: "pointer", transition: "all 0.15s" },
  phaseBtnActive:{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24", fontWeight: 600 },
  toggle:        { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  toggleTrack:   { width: 38, height: 22, borderRadius: 11, position: "relative", transition: "background 0.2s", flexShrink: 0 },
  toggleThumb:   { position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  costCard:      { background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 },
  costRow:       { display: "flex", justifyContent: "space-between" },
  costKey:       { fontSize: 11, color: "#6B7280" },
  costVal:       { fontSize: 11, color: "#E2E8F0", fontFamily: "monospace" },
  saveBtn:       { flex: 1, background: "linear-gradient(135deg,#2563EB,#1D4ED8)", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer" },
  clearBtn:      { padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" },
  toast:         { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#1E293B", border: "1px solid rgba(96,165,250,0.3)", color: "#60A5FA", borderRadius: 7, padding: "8px 18px", fontSize: 12, fontWeight: 600, fontFamily: "monospace", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", whiteSpace: "nowrap" },
};
