import { useState, useEffect } from "react";

const DEPARTMENTS = ["Medical", "Administrative", "Support", "Residential", "Retail", "Parking", "Mechanical"];
const FUNCTIONS   = ["Inpatient", "Outpatient", "ICU", "Emergency", "Office", "Lobby", "Circulation", "Storage", "Amenity"];
const PHASES      = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
const COST_DEFAULTS = {
  Inpatient: 650, Outpatient: 420, ICU: 850, Emergency: 720,
  Office: 280, Lobby: 310, Circulation: 180, Storage: 140, Amenity: 350,
};

function fmt(n)    { return n?.toLocaleString("en-US") ?? "—"; }
function fmtUSD(n) { return n ? "$" + Math.round(n).toLocaleString("en-US") : "—"; }

export default function ParameterPanel({ volume, parseName, readParams, saveParams }) {
  const parsed = parseName(volume.name);
  const [form, setForm]     = useState(initForm(parsed));
  const [saved, setSaved]   = useState(false);
  const [toast, setToast]   = useState(null);
  const [loading, setLoad]  = useState(true);

  // Load any previously saved params from Forma on volume change
  useEffect(() => {
    setSaved(false);
    setLoad(true);
    readParams(volume.path).then((existing) => {
      if (existing) {
        setForm(existing);
        setSaved(true);
      } else {
        setForm(initForm(parsed));
      }
      setLoad(false);
    });
  }, [volume.path]);

  function initForm(p) {
    const fn = p.function || "";
    return {
      department: p.department || "",
      function:   fn,
      phasing:    p.phasing    || "",
      room:       "",
      costPerSF:  COST_DEFAULTS[fn] || "",
    };
  }

  function handleChange(key, val) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "function") next.costPerSF = COST_DEFAULTS[val] || prev.costPerSF;
      return next;
    });
  }

  function handleAutoFill() {
    const fn = parsed.function || "";
    setForm({
      department: parsed.department || "",
      function:   fn,
      phasing:    parsed.phasing    || "",
      room:       "",
      costPerSF:  COST_DEFAULTS[fn] || "",
    });
  }

  async function handleSave() {
    try {
      await saveParams(volume.path, form);
      setSaved(true);
      showToast("Saved ✓");
    } catch (err) {
      showToast("Save failed: " + err.message);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const area      = volume.area || 0;
  const costPerSF = parseFloat(form.costPerSF) || 0;
  const totalCost = area * costPerSF;
  const hasConvention = volume.name?.includes("_");

  if (loading) return <div style={S.status}>Loading saved data…</div>;

  return (
    <div style={S.panel}>

      {/* Volume header */}
      <div style={S.header}>
        <div style={S.label}>Selected volume</div>
        <div style={S.volName}>{volume.name}</div>
        <div style={S.volMeta}>{fmt(area)} SF</div>
      </div>

      {/* Name parse visualizer */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Auto-parse from name</div>
        {hasConvention ? (
          <>
            <div style={S.chipRow}>
              {[
                { label: "Phase",  value: parsed.phasing    },
                { label: "Dept",   value: parsed.department },
                { label: "Func",   value: parsed.function   },
                { label: "Index",  value: parsed.index      },
              ].map(({ label, value }) => (
                <div key={label} style={S.chip}>
                  <span style={S.chipLabel}>{label}</span>
                  <span style={{ ...S.chipValue, ...(value ? S.chipValueActive : {}) }}>
                    {value || "—"}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={handleAutoFill} style={S.autoBtn}>
              Auto-fill fields ↓
            </button>
          </>
        ) : (
          <div style={S.hint}>No naming convention detected. Fill manually below.</div>
        )}
      </div>

      {/* Form */}
      <div style={S.form}>

        <Field label="Department">
          <select value={form.department} onChange={(e) => handleChange("department", e.target.value)} style={S.input}>
            <option value="">— select —</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Function">
          <select value={form.function} onChange={(e) => handleChange("function", e.target.value)} style={S.input}>
            <option value="">— select —</option>
            {FUNCTIONS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>

        <Field label="Room" hint="optional">
          <input
            value={form.room}
            onChange={(e) => handleChange("room", e.target.value)}
            placeholder="e.g. 4B North Wing"
            style={S.input}
          />
        </Field>

        <Field label="Phasing">
          <select value={form.phasing} onChange={(e) => handleChange("phasing", e.target.value)} style={S.input}>
            <option value="">— select —</option>
            {PHASES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>

        {/* Cost calc */}
        <div style={S.card}>
          <Field label="Cost / SF" hint="auto-suggested by function">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#6B7280" }}>$</span>
              <input
                type="number"
                value={form.costPerSF}
                onChange={(e) => handleChange("costPerSF", e.target.value)}
                placeholder="0"
                style={{ ...S.input, flex: 1 }}
              />
              <span style={{ color: "#6B7280", fontSize: 11 }}>/ SF</span>
            </div>
          </Field>

          <div style={S.costRow}>
            {[
              { label: "Area",    value: `${fmt(area)} SF` },
              { label: "$/SF",    value: costPerSF ? `$${fmt(costPerSF)}` : "—" },
              { label: "Total",   value: fmtUSD(totalCost) },
            ].map(({ label, value }) => (
              <div key={label} style={S.costCell}>
                <div style={S.costLabel}>{label}</div>
                <div style={{ ...S.costValue, ...(label === "Total" ? S.costTotal : {}) }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <button onClick={handleSave} style={S.saveBtn}>
          Save to Element
        </button>

        {/* Saved confirmation */}
        {saved && (
          <div style={S.savedCard}>
            <div style={S.savedLabel}>Written to Forma element</div>
            {Object.entries(form).map(([k, v]) =>
              v ? (
                <div key={k} style={S.savedRow}>
                  <span style={S.savedKey}>{k}</span>
                  <span style={S.savedVal}>
                    {k === "costPerSF" ? `$${v}/SF → ${fmtUSD(area * parseFloat(v))} total` : v}
                  </span>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={S.fieldLabel}>{label}</span>
        {hint && <span style={S.fieldHint}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const S = {
  panel:      { flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", color: "#E2E8F0" },
  header:     { padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.15)" },
  label:      { fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B7280", fontFamily: "monospace", marginBottom: 4 },
  volName:    { fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "#F1F5F9" },
  volMeta:    { fontSize: 11, color: "#6B7280", marginTop: 2 },
  card:       { margin: "12px 16px 0", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "12px 14px" },
  sectionLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 10 },
  chipRow:    { display: "flex", gap: 8, flexWrap: "wrap" },
  chip:       { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  chipLabel:  { fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B7280", fontFamily: "monospace" },
  chipValue:  { fontSize: 11, fontFamily: "monospace", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", color: "#4B5563", background: "rgba(255,255,255,0.03)" },
  chipValueActive: { color: "#E2E8F0", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)" },
  autoBtn:    { marginTop: 10, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 5, color: "#60A5FA", fontSize: 11, padding: "5px 12px", cursor: "pointer", fontFamily: "monospace" },
  hint:       { fontSize: 11, color: "#6B7280", fontStyle: "italic" },
  form:       { padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 12 },
  input:      { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#E2E8F0", fontSize: 13, padding: "7px 10px", outline: "none", width: "100%", fontFamily: "Inter, sans-serif" },
  fieldLabel: { fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9CA3AF", fontFamily: "monospace" },
  fieldHint:  { fontSize: 10, color: "#4B5563" },
  costRow:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 },
  costCell:   { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "8px 10px", textAlign: "center" },
  costLabel:  { fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B7280", fontFamily: "monospace", marginBottom: 4 },
  costValue:  { fontSize: 13, fontWeight: 700, color: "#E2E8F0", fontFamily: "monospace" },
  costTotal:  { color: "#34D399" },
  saveBtn:    { background: "linear-gradient(135deg, #2563EB, #1D4ED8)", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, padding: "11px 0", cursor: "pointer", boxShadow: "0 2px 12px rgba(37,99,235,0.35)" },
  savedCard:  { background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "10px 14px" },
  savedLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#34D399", fontFamily: "monospace", marginBottom: 8 },
  savedRow:   { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", marginTop: 3 },
  savedKey:   { fontFamily: "monospace", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.07em" },
  savedVal:   { color: "#E2E8F0", fontFamily: "monospace" },
  toast:      { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1E293B", border: "1px solid rgba(52,211,153,0.4)", color: "#34D399", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "monospace", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" },
  status:     { padding: 20, color: "#6B7280", fontSize: 13, fontFamily: "monospace" },
};
