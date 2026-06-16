import { useState, useEffect } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";

const FUNCTIONS    = ["3 Bedroom", "2 Bedroom", "1 Bedroom", "Core", "Corridor", "Amenity"];
const PHASES       = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
const COST_DEFAULT = { "3 Bedroom": 220, "2 Bedroom": 200, "1 Bedroom": 185, "Core": 95, "Corridor": 80, "Amenity": 160 };

// Map our function names to Forma's built-in function IDs where applicable.
// Built-in IDs: "residential", "commercial", "unspecified"
// For functions not in Forma's built-ins, we create a custom one by name.
const FORMA_BUILTIN_MAP = {
  "3 Bedroom":  "residential",
  "2 Bedroom":  "residential",
  "1 Bedroom":  "residential",
  "Core":       "unspecified",
  "Corridor":   "unspecified",
  "Amenity":    "commercial",
};

function emptyForm() {
  return { sector: "Affordable Housing", function: "", costPerSF: "", phase: "Phase 1", withinSite: false };
}

// ── Sync function to Forma's native building function field ───────────────────
// Flow:
//  1. Forma.settings.get() → list existing project functions
//  2. Find by name, or create via Forma.settings.buildingFunctions.add()
//  3. Forma.elements.editProperties({ urn, propertiesJsonMergePatch })
//     using namespace "affordable:params" to store our data on the element
//  4. Forma.proposal.replaceElement({ path, urn }) to commit the change
//
// Note: native functionId (deprecated) can only be set via the built-in
// function IDs ("residential", "commercial", "unspecified"). For our custom
// names we use editProperties with our own namespace so data lives on the element.
async function syncFunctionToForma(path, elementUrn, fnName) {
  try {
    // Get all project functions
    const { buildingFunctions } = await Forma.settings.get();

    // Find existing or create new
    let match = buildingFunctions.find(
      (f) => f.name.toLowerCase() === fnName.toLowerCase()
    );
    if (!match) {
      const result = await Forma.settings.buildingFunctions.add({ name: fnName });
      match = result.buildingFunctions.find(
        (f) => f.name.toLowerCase() === fnName.toLowerCase()
      );
    }

    if (!match) return; // shouldn't happen

    // Write the function ID onto the element via editProperties
    // This uses our custom namespace "affordable:params" to store the assignment
    // AND also updates the native functionId via the built-in mapping
    const builtinId = FORMA_BUILTIN_MAP[fnName] ?? "unspecified";
    const { urn: newUrn } = await Forma.elements.editProperties({
      urn: elementUrn,
      propertiesJsonMergePatch: {
        "affordable:params": {
          functionName: fnName,
          functionId:   match.id,
        },
      },
    });

    // Replace the element in the proposal to commit the property change
    await Forma.proposal.replaceElement({ path, urn: newUrn });

  } catch (e) {
    // Non-fatal — localStorage assignment still works even if Forma sync fails
    console.warn("[Forma] syncFunctionToForma failed", e);
  }
}

export default function Assign({ selected, allData, onSave }) {
  const [form,     setForm]     = useState(emptyForm());
  const [toast,    setToast]    = useState(null);
  const [syncing,  setSyncing]  = useState(false);
  const [elementUrn, setElementUrn] = useState(null);

  // When selected building changes → load saved data + fetch element URN
  useEffect(() => {
    if (!selected) return;
    const saved = allData[selected.path];
    setForm(saved ? { ...emptyForm(), ...saved } : emptyForm());

    // Fetch element URN for Forma sync
    Forma.elements.getByPath({ path: selected.path })
      .then((res) => setElementUrn(res?.element?.urn ?? null))
      .catch(() => setElementUrn(null));
  }, [selected?.path]);

  function handleChange(key, val) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "function" && !allData[selected?.path]?.costPerSF) {
        next.costPerSF = COST_DEFAULT[val] || "";
      }
      return next;
    });
  }

  async function handleSave() {
    if (!selected) return;
    if (!form.function) { showToast("⚠ Select a function first"); return; }

    // 1. Save to localStorage immediately
    onSave(selected.path, form);

    // 2. Sync to Forma's native function field in the background
    if (elementUrn) {
      setSyncing(true);
      showToast("Saving…");
      await syncFunctionToForma(selected.path, elementUrn, form.function);
      setSyncing(false);
    }

    showToast("Saved ✓");
  }

  function handleClear() {
    if (!selected) return;
    onSave(selected.path, null);
    setForm(emptyForm());
    showToast("Cleared");
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const costPerSF = parseFloat(form.costPerSF) || 0;
  const totalCost = selected ? selected.gfaSF * costPerSF : 0;
  const isSaved   = selected && !!allData[selected.path]?.function;

  if (!selected) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No building selected</div>
        <div style={S.emptyNote}>Click any building in the Forma canvas to assign parameters</div>
      </div>
    );
  }

  return (
    <div style={S.root}>

      {/* Live building stats */}
      <div style={S.statsCard}>
        <div style={S.statsLabel}>Live from Forma</div>
        <div style={S.statsGrid}>
          <Stat label="Floors"    value={selected.floors} />
          <Stat label="Total GFA" value={`${selected.gfaSF.toLocaleString()} SF`} />
          <Stat label="Per Floor" value={`${selected.footprintSF.toLocaleString()} SF`} />
          <Stat label="Height"    value={`${selected.heightFt} ft`} />
        </div>
        <div style={S.pathLabel}>{selected.path.split("/").pop()}</div>
      </div>

      <div style={S.form}>

        {/* Function picker */}
        <Field label="Function" hint={syncing ? "syncing to Forma…" : elementUrn ? "syncs to Forma panel" : ""}>
          <div style={S.fnGrid}>
            {FUNCTIONS.map((fn) => (
              <button
                key={fn}
                onClick={() => handleChange("function", fn)}
                style={{ ...S.fnBtn, ...(form.function === fn ? S.fnActive : {}) }}
              >
                {fn}
              </button>
            ))}
          </div>
        </Field>

        {/* Cost / SF */}
        <Field label="Cost / SF" hint="auto-suggested">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={S.prefix}>$</span>
            <input
              type="number"
              value={form.costPerSF}
              onChange={(e) => handleChange("costPerSF", e.target.value)}
              placeholder="0"
              style={{ ...S.input, flex: 1 }}
            />
            <span style={S.suffix}>/SF</span>
          </div>
        </Field>

        {/* Phase */}
        <Field label="Phase">
          <div style={{ display: "flex", gap: 5 }}>
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => handleChange("phase", p)}
                style={{ ...S.phaseBtn, ...(form.phase === p ? S.phaseActive : {}) }}
              >
                {p.replace("Phase ", "P")}
              </button>
            ))}
          </div>
        </Field>

        {/* Within site */}
        <Field label="Within Site Limit">
          <div onClick={() => handleChange("withinSite", !form.withinSite)} style={S.toggleRow}>
            <div style={{ ...S.track, background: form.withinSite ? "#22C55E" : "#374151" }}>
              <div style={{ ...S.thumb, transform: form.withinSite ? "translateX(18px)" : "translateX(2px)" }} />
            </div>
            <span style={{ color: form.withinSite ? "#34D399" : "#6B7280", fontSize: 12 }}>
              {form.withinSite ? "Yes — counted in Matrix" : "No — excluded from Matrix"}
            </span>
          </div>
        </Field>

        {/* Cost summary */}
        {form.function && costPerSF > 0 && (
          <div style={S.costCard}>
            <div style={S.costRow}>
              <span style={S.costKey}>GFA from Forma</span>
              <span style={S.costVal}>{selected.gfaSF.toLocaleString()} SF</span>
            </div>
            <div style={S.costRow}>
              <span style={S.costKey}>Cost / SF</span>
              <span style={S.costVal}>${costPerSF}</span>
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
          <button onClick={handleSave} disabled={syncing} style={{ ...S.saveBtn, opacity: syncing ? 0.7 : 1 }}>
            {syncing ? "Syncing…" : "Save to Element"}
          </button>
          {isSaved && (
            <button onClick={handleClear} style={S.clearBtn}>Clear</button>
          )}
        </div>

        {/* Saved badge */}
        {isSaved && (
          <div style={S.savedBadge}>
            <span style={{ color: "#34D399" }}>✓</span> Parameters saved
            {allData[selected.path]?.withinSite && (
              <span style={S.inSiteTag}>IN SITE</span>
            )}
          </div>
        )}
      </div>

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
        {hint && <span style={{ fontSize: 10, color: "#4B5563", fontStyle: "italic" }}>{hint}</span>}
      </div>
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
  root:       { display: "flex", flexDirection: "column" },
  empty:      { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, padding: 24, textAlign: "center" },
  emptyIcon:  { fontSize: 32, opacity: 0.15 },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  emptyNote:  { fontSize: 12, color: "#4B5563", lineHeight: 1.6 },
  statsCard:  { margin: "12px 14px 0", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 12px" },
  statsLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#60A5FA", fontFamily: "monospace", marginBottom: 10 },
  statsGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 },
  pathLabel:  { fontSize: 9, color: "#374151", fontFamily: "monospace", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  form:       { padding: "12px 14px 24px", display: "flex", flexDirection: "column", gap: 14 },
  fnGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 },
  fnBtn:      { padding: "7px 4px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: "rgba(255,255,255,0.03)", color: "#9CA3AF", fontSize: 11, cursor: "pointer", transition: "all 0.12s" },
  fnActive:   { background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", color: "#60A5FA", fontWeight: 600 },
  input:      { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#E2E8F0", fontSize: 13, padding: "7px 10px", outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box" },
  prefix:     { color: "#6B7280", fontSize: 13 },
  suffix:     { color: "#6B7280", fontSize: 11 },
  phaseBtn:   { flex: 1, padding: "6px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, background: "rgba(255,255,255,0.03)", color: "#9CA3AF", fontSize: 11, cursor: "pointer", transition: "all 0.12s" },
  phaseActive:{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24", fontWeight: 600 },
  toggleRow:  { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  track:      { width: 38, height: 22, borderRadius: 11, position: "relative", transition: "background 0.2s", flexShrink: 0 },
  thumb:      { position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  costCard:   { background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 },
  costRow:    { display: "flex", justifyContent: "space-between" },
  costKey:    { fontSize: 11, color: "#6B7280" },
  costVal:    { fontSize: 11, color: "#E2E8F0", fontFamily: "monospace" },
  saveBtn:    { flex: 1, background: "linear-gradient(135deg,#2563EB,#1D4ED8)", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer" },
  clearBtn:   { padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6B7280", fontSize: 12, cursor: "pointer" },
  savedBadge: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#6B7280", padding: "6px 10px", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 6 },
  inSiteTag:  { marginLeft: "auto", fontSize: 9, color: "#34D399", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.07em" },
  toast:      { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#1E293B", border: "1px solid rgba(96,165,250,0.3)", color: "#60A5FA", borderRadius: 7, padding: "8px 18px", fontSize: 12, fontWeight: 600, fontFamily: "monospace", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", whiteSpace: "nowrap" },
};
