import { useState, useEffect, useCallback } from "react";
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
// CORRECT SDK USAGE (verified against SDK type definitions):
//
//  Step 1: Forma.elements.getByPath({ path })
//          → returns { element }  where element.urn is the FULL URN
//          → element.representations?.graphBuilding tells us if it exists
//
//  Step 2: Forma.elements.representations.graphBuilding({ urn: element.urn })
//          → returns { data: GraphBuilding }
//          → data.levels: GraphBuildingLevel[]  → length = floor count
//          → each level.height is in metres
//
//  Step 3: Forma.areaMetrics.calculate({ paths: [path] })
//          → builtInMetrics.grossFloorArea.value  (m²)
//          → builtInMetrics.buildingCoverage.value (m²)
//
async function readFormaElement(path) {
  try {
    let floors   = 0;
    let heightFt = 0;
    let gfaSF       = 0;
    let footprintSF = 0;

    // ── Step 1 + 2: Get element by path, then fetch graphBuilding ─────────────
    try {
      const { element } = await Forma.elements.getByPath({ path });

      if (element?.representations?.graphBuilding) {
        const gb = await Forma.elements.representations.graphBuilding({ urn: element.urn });
        const levels = gb?.data?.levels ?? [];

        if (levels.length > 0) {
          floors         = levels.length;
          const totalM   = levels.reduce((s, l) => s + (l.height ?? 0), 0);
          heightFt       = totalM > 0 ? Math.round(totalM * 3.281) : floors * 10;
        }
      }
    } catch (e) {
      console.warn("[Forma] graphBuilding fetch failed for", path, e);
    }

    // ── Step 3: areaMetrics for GFA + footprint ───────────────────────────────
    try {
      const result = await Forma.areaMetrics.calculate({ paths: [path] });
      const bim    = result?.builtInMetrics ?? {};
      const gfaM2  = typeof bim.grossFloorArea?.value   === "number" ? bim.grossFloorArea.value   : 0;
      const covM2  = typeof bim.buildingCoverage?.value === "number" ? bim.buildingCoverage.value : 0;

      gfaSF       = Math.round(gfaM2 * 10.764);
      footprintSF = Math.round(covM2  * 10.764);

      // Fallback: if graphBuilding gave nothing, derive floors from GFA/coverage
      if (floors === 0 && covM2 > 0 && gfaM2 > 0) {
        floors   = Math.max(1, Math.round(gfaM2 / covM2));
        heightFt = heightFt || (floors * 10);
      }
    } catch (e) {
      console.warn("[Forma] areaMetrics failed for", path, e);
    }

    // ── Final safety defaults ─────────────────────────────────────────────────
    if (floors   === 0) floors   = 1;
    if (heightFt === 0) heightFt = floors * 10;

    return { path, gfaSF, floors, heightFt, footprintSF };

  } catch (err) {
    console.warn("[Forma] readFormaElement failed for", path, err);
    return { path, gfaSF: 0, floors: 1, heightFt: 0, footprintSF: 0 };
  }
}

const TABS = ["Assign", "Matrix", "Visualize", "Report"];

export default function App() {
  const [activeTab,    setActiveTab]    = useState("Assign");
  const [selected,     setSelected]     = useState(null);   // { path, gfaSF, floors, heightFt, footprintSF }
  const [allBuildings, setAllBuildings] = useState([]);     // all buildings with their Forma data
  const [allData,      setAllData]      = useState(loadAllData());
  const [status,       setStatus]       = useState("Click a building in Forma to begin");

  // ── Reload all buildings (called on proposal change) ────────────────────────
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
      // Outside Forma — use mock data
      setAllBuildings(MOCK_BUILDINGS);
    }
  }, []);

  // ── Subscribe to SELECTION — fires when user clicks a building in Forma ─────
  useEffect(() => {
    let unsubSelection;
    try {
      unsubSelection = Forma.selection.subscribe(async ({ paths }) => {
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
      });
    } catch {
      // Outside Forma — auto-select first mock building
      setSelected(MOCK_BUILDINGS[0]);
      setAllBuildings(MOCK_BUILDINGS);
      setStatus(null);
    }

    return () => { if (typeof unsubSelection === "function") unsubSelection(); };
  }, []);

  // ── Subscribe to PROPOSAL changes — fires when buildings are modified ────────
  useEffect(() => {
    reloadAllBuildings();

    let unsubProposal;
    try {
      unsubProposal = Forma.proposal.subscribe(async () => {
        await reloadAllBuildings();
        setSelected((prev) => {
          if (!prev) return prev;
          readFormaElement(prev.path).then(setSelected);
          return prev;
        });
      });
    } catch {
      // Outside Forma — no subscription needed
    }

    return () => { if (typeof unsubProposal === "function") unsubProposal(); };
  }, [reloadAllBuildings]);

  // Refresh allData from localStorage on tab switch
  useEffect(() => {
    setAllData(loadAllData());
  }, [activeTab]);

  function handleSave(path, data) {
    saveElementData(path, data);
    setAllData(loadAllData());
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
        {activeTab === "Assign" && (
          <Assign
            selected={selected}
            allData={allData}
            onSave={handleSave}
          />
        )}
        {activeTab === "Matrix" && (
          <Matrix
            allBuildings={allBuildings}
            allData={allData}
          />
        )}
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

// ─── Mock buildings for dev/testing outside Forma ─────────────────────────────
const MOCK_BUILDINGS = [
  { path: "/mock/bldg-001", gfaSF: 13200, floors: 6,  heightFt: 62,  footprintSF: 2200 },
  { path: "/mock/bldg-002", gfaSF: 8500,  floors: 4,  heightFt: 42,  footprintSF: 2125 },
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
