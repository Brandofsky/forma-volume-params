import { useState, useEffect, useCallback, useRef } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import Assign from "./components/Assign.jsx";
import Matrix from "./components/Matrix.jsx";

// ─── localStorage helpers ─────────────────────────────────────────────────────
const STORAGE_KEY = "forma-affordable-v3";

export function loadAllData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

export function saveElementData(path, data) {
  const all = loadAllData();
  if (data === null) { delete all[path]; }
  else { all[path] = data; }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// ─── Read REAL properties from a Forma building path ─────────────────────────
//
// Step 1: getByPath({ path })       → element.urn + check representations
// Step 2: graphBuilding({ urn })    → levels.length = floors, sum heights = total height
// Step 3: grossFloorAreaPolygons    → shoelace area sum → GFA in SF
// Step 4: areaMetrics               → footprint + fallback GFA/floors
//
async function readFormaElement(path) {
  try {
    let floors = 0, heightFt = 0, gfaSF = 0, footprintSF = 0;

    // Step 1: get element object
    let element = null;
    try {
      const result = await Forma.elements.getByPath({ path });
      element = result?.element ?? null;
    } catch (e) {
      console.warn("[Forma] getByPath failed", path, e);
    }

    // Step 2: graphBuilding → authoritative floors + height
    if (element?.representations?.graphBuilding) {
      try {
        const gb     = await Forma.elements.representations.graphBuilding({ urn: element.urn });
        const levels = gb?.data?.levels ?? [];
        if (levels.length > 0) {
          floors       = levels.length;
          const totalM = levels.reduce((s, l) => s + (l.height ?? 0), 0);
          heightFt     = totalM > 0 ? Math.round(totalM * 3.281) : floors * 10;
        }
      } catch (e) {
        console.warn("[Forma] graphBuilding failed", element.urn, e);
      }
    }

    // Step 3: grossFloorAreaPolygons → precise GFA via shoelace formula
    if (element?.representations?.grossFloorAreaPolygons) {
      try {
        const gfaRep = await Forma.elements.representations.grossFloorAreaPolygons({ urn: element.urn });
        const polys  = gfaRep?.data ?? [];
        let totalM2  = 0;
        for (const poly of polys) {
          const pts = poly?.polygon ?? [];
          if (pts.length < 3) continue;
          let area = 0;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
          }
          totalM2 += Math.abs(area) / 2;
        }
        if (totalM2 > 0) gfaSF = Math.round(totalM2 * 10.764);

        // floor count fallback from distinct Z elevations
        if (floors === 0 && polys.length > 0) {
          const uniqueZ = new Set(polys.map((p) => Math.round((p?.polygon?.[0]?.[2] ?? 0) * 10)));
          floors = Math.max(1, uniqueZ.size);
        }
      } catch (e) {
        console.warn("[Forma] grossFloorAreaPolygons failed", element?.urn, e);
      }
    }

    // Step 4: areaMetrics → footprint + fallbacks
    try {
      const result = await Forma.areaMetrics.calculate({ paths: [path] });
      const bim    = result?.builtInMetrics ?? {};
      const gfaM2  = typeof bim.grossFloorArea?.value   === "number" ? bim.grossFloorArea.value   : 0;
      const covM2  = typeof bim.buildingCoverage?.value === "number" ? bim.buildingCoverage.value : 0;

      if (covM2 > 0) footprintSF = Math.round(covM2 * 10.764);
      if (gfaSF === 0 && gfaM2 > 0) gfaSF = Math.round(gfaM2 * 10.764);
      if (floors === 0 && covM2 > 0 && gfaM2 > 0) floors = Math.max(1, Math.round(gfaM2 / covM2));
    } catch (e) {
      console.warn("[Forma] areaMetrics failed", path, e);
    }

    if (floors   === 0) floors   = 1;
    if (heightFt === 0) heightFt = floors * 10;

    return { path, gfaSF, floors, heightFt, footprintSF };
  } catch (err) {
    console.warn("[Forma] readFormaElement failed", path, err);
    return { path, gfaSF: 0, floors: 1, heightFt: 0, footprintSF: 0 };
  }
}

const TABS = ["Assign", "Matrix", "Visualize", "Report"];

export default function App() {
  const [activeTab,    setActiveTab]    = useState("Assign");
  const [selected,     setSelected]     = useState(null);
  const [allBuildings, setAllBuildings] = useState([]);
  const [allData,      setAllData]      = useState(loadAllData());
  const [status,       setStatus]       = useState("Click a building in Forma to begin");

  // ── Sync allData from localStorage ──────────────────────────────────────────
  // Called after any save AND after geometry changes, not just on tab switch
  const syncAllData = useCallback(() => {
    setAllData(loadAllData());
  }, []);

  // ── Reload all buildings from Forma ─────────────────────────────────────────
  const reloadAllBuildings = useCallback(async () => {
    try {
      const paths = await Forma.geometry.getPathsByCategory({ category: "building" });
      if (!paths || paths.length === 0) {
        setAllBuildings([]);
        return;
      }
      const buildings = await Promise.all(paths.map(readFormaElement));
      setAllBuildings(buildings.filter(Boolean));
    } catch {
      setAllBuildings(MOCK_BUILDINGS);
    }
  }, []);

  // ── Selection subscription ───────────────────────────────────────────────────
  useEffect(() => {
    let unsub;
    try {
      unsub = Forma.selection.subscribe(async ({ paths }) => {
        if (!paths || paths.length === 0) {
          setSelected(null);
          setStatus("Click a building in Forma to begin");
          return;
        }
        setStatus("Loading building data…");
        const el = await readFormaElement(paths[0]);
        setSelected(el);
        setStatus(null);
        setActiveTab("Assign");
        syncAllData(); // refresh saved data when selection changes
      });
    } catch {
      setSelected(MOCK_BUILDINGS[0]);
      setAllBuildings(MOCK_BUILDINGS);
      setStatus(null);
    }
    return () => { if (typeof unsub === "function") unsub(); };
  }, [syncAllData]);

  // ── Proposal subscription — geometry changes ─────────────────────────────────
  // This fires when the user edits building geometry in Forma (resize, add floor, etc.)
  useEffect(() => {
    reloadAllBuildings(); // initial load

    let unsub;
    try {
      unsub = Forma.proposal.subscribe(async () => {
        // Reload all building geometry data from Forma
        await reloadAllBuildings();

        // Also refresh the currently selected building
        setSelected((prev) => {
          if (!prev) return prev;
          readFormaElement(prev.path).then((updated) => {
            setSelected(updated);
          });
          return prev;
        });

        // Sync allData so Matrix reflects any localStorage changes too
        syncAllData();
      });
    } catch { /* outside Forma */ }

    return () => { if (typeof unsub === "function") unsub(); };
  }, [reloadAllBuildings, syncAllData]);

  // ── Tab switch — also sync allData ──────────────────────────────────────────
  useEffect(() => {
    syncAllData();
  }, [activeTab, syncAllData]);

  // ── Save handler ─────────────────────────────────────────────────────────────
  function handleSave(path, data) {
    saveElementData(path, data);
    syncAllData(); // immediate update so Matrix reflects the new assignment
  }

  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTitle}>Affordable Housing</div>
        {selected ? (
          <div style={S.headerSub}>
            {selected.floors} fl · {selected.gfaSF.toLocaleString()} SF · {selected.heightFt}ft
          </div>
        ) : (
          <div style={S.headerHint}>{status}</div>
        )}
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : S.tabInactive) }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={S.content}>
        {activeTab === "Assign"    && <Assign selected={selected} allData={allData} onSave={handleSave} />}
        {activeTab === "Matrix"    && <Matrix allBuildings={allBuildings} allData={allData} />}
        {activeTab === "Visualize" && <Placeholder label="Visualize" note="Charts — coming next" />}
        {activeTab === "Report"    && <Placeholder label="Report"    note="Export — coming next" />}
      </div>
    </div>
  );
}

function Placeholder({ label, note }) {
  return (
    <div style={S.placeholder}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#4B5563" }}>{note}</div>
    </div>
  );
}

const MOCK_BUILDINGS = [
  { path: "/mock/bldg-001", gfaSF: 13200, floors: 6,  heightFt: 62,  footprintSF: 2200 },
  { path: "/mock/bldg-002", gfaSF: 8500,  floors: 3,  heightFt: 32,  footprintSF: 2125 },
  { path: "/mock/bldg-003", gfaSF: 18400, floors: 8,  heightFt: 84,  footprintSF: 2300 },
  { path: "/mock/bldg-004", gfaSF: 6600,  floors: 3,  heightFt: 32,  footprintSF: 2200 },
  { path: "/mock/bldg-005", gfaSF: 22000, floors: 10, heightFt: 104, footprintSF: 2200 },
];

const S = {
  root:        { display: "flex", flexDirection: "column", height: "100vh", background: "#0F1117", color: "#E2E8F0", fontFamily: "Inter, sans-serif", fontSize: 13 },
  header:      { padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)", flexShrink: 0 },
  headerTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#60A5FA" },
  headerSub:   { fontSize: 12, color: "#E2E8F0", marginTop: 3, fontFamily: "monospace" },
  headerHint:  { fontSize: 11, color: "#4B5563", marginTop: 3, fontStyle: "italic" },
  tabBar:      { display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  tab:         { flex: 1, padding: "9px 0", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", transition: "all 0.15s" },
  tabActive:   { background: "#0F1117", color: "#60A5FA", borderBottom: "2px solid #60A5FA" },
  tabInactive: { background: "transparent", color: "#4B5563", borderBottom: "2px solid transparent" },
  content:     { flex: 1, overflowY: "auto" },
  placeholder: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 },
};
