import { useState, useEffect, useCallback } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import Assign    from "./components/Assign.jsx";
import Matrix    from "./components/Matrix.jsx";
import Visualize from "./components/Visualize.jsx";

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

function polygonAreaM2(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area) / 2;
}

// ─── Read building data + function breakdown from Forma ───────────────────────
async function readFormaElement(path) {
  try {
    let floors = 0, heightFt = 0, gfaSF = 0, footprintSF = 0;
    let breakdown = []; // [{ functionId, functionName, functionColor, gfaSF }]

    // Step 1: element object
    let element = null;
    try {
      const res = await Forma.elements.getByPath({ path });
      element = res?.element ?? null;
    } catch (e) { console.warn("[Forma] getByPath failed", path, e); }

    // Step 2: graphBuilding → floors + height
    if (element?.representations?.graphBuilding) {
      try {
        const gb     = await Forma.elements.representations.graphBuilding({ urn: element.urn });
        const levels = gb?.data?.levels ?? [];
        if (levels.length > 0) {
          floors       = levels.length;
          const totalM = levels.reduce((s, l) => s + (l.height ?? 0), 0);
          heightFt     = totalM > 0 ? Math.round(totalM * 3.281) : floors * 10;
        }
      } catch (e) { console.warn("[Forma] graphBuilding failed", element.urn, e); }
    }

    // Step 3: grossFloorAreaPolygons → GFA
    if (element?.representations?.grossFloorAreaPolygons) {
      try {
        const rep   = await Forma.elements.representations.grossFloorAreaPolygons({ urn: element.urn });
        const polys = rep?.data ?? [];
        let totalM2 = 0;
        for (const poly of polys) {
          const ring = poly?.grossFloorPolygon?.[0];
          if (!ring || ring.length < 3) continue;
          totalM2 += polygonAreaM2(ring);
        }
        if (totalM2 > 0) gfaSF = Math.round(totalM2 * 10.764);
        if (floors === 0 && polys.length > 0) {
          floors = Math.max(1, new Set(polys.map(p => Math.round((p.elevation ?? 0) * 100))).size);
        }
      } catch (e) { console.warn("[Forma] grossFloorAreaPolygons failed", element?.urn, e); }
    }

    // Step 4: areaMetrics → footprint + GFA fallback + FUNCTION BREAKDOWN
    try {
      const result = await Forma.areaMetrics.calculate({ paths: [path] });
      const bim    = result?.builtInMetrics ?? {};
      const covM2  = bim.buildingCoverage?.value ?? 0;
      if (covM2 > 0) footprintSF = Math.round(covM2 * 10.764);

      // Function breakdown — one entry per function defined in Forma's floor plan editor
      // { functionId, functionName, functionColor, value: m² }
      const fbs = bim.grossFloorArea?.functionBreakdown ?? [];
      breakdown = fbs
        .filter(fb => typeof fb.value === "number" && fb.value > 0)
        .map(fb => ({
          functionId:    fb.functionId,
          functionName:  fb.functionName,
          functionColor: fb.functionColor ?? "#60A5FA",
          gfaSF:         Math.round(fb.value * 10.764),
        }));

      // GFA fallback from breakdown sum if grossFloorAreaPolygons gave nothing
      if (gfaSF === 0 && breakdown.length > 0) {
        gfaSF = breakdown.reduce((s, fn) => s + fn.gfaSF, 0);
      }
      // Floor fallback
      if (floors === 0 && covM2 > 0 && gfaSF > 0) {
        floors = Math.max(1, Math.round((gfaSF / 10.764) / covM2));
      }
    } catch (e) { console.warn("[Forma] areaMetrics failed", path, e); }

    if (floors   === 0) floors   = 1;
    if (heightFt === 0) heightFt = floors * 10;

    return { path, gfaSF, floors, heightFt, footprintSF, breakdown };
  } catch (err) {
    console.warn("[Forma] readFormaElement failed", path, err);
    return { path, gfaSF: 0, floors: 1, heightFt: 0, footprintSF: 0, breakdown: [] };
  }
}

const TABS = ["Assign", "Matrix", "Visualize", "Report"];

export default function App() {
  const [activeTab,    setActiveTab]    = useState("Assign");
  const [selected,     setSelected]     = useState(null);
  const [allBuildings, setAllBuildings] = useState([]);
  const [allData,      setAllData]      = useState(loadAllData());
  const [status,       setStatus]       = useState("Click a building in Forma to begin");

  const syncAllData = useCallback(() => { setAllData(loadAllData()); }, []);

  const reloadAllBuildings = useCallback(async () => {
    try {
      const paths = await Forma.geometry.getPathsByCategory({ category: "building" });
      if (!paths || paths.length === 0) { setAllBuildings([]); return; }
      const buildings = await Promise.all(paths.map(readFormaElement));
      setAllBuildings(buildings.filter(Boolean));
    } catch {
      setAllBuildings(MOCK_BUILDINGS);
    }
  }, []);

  useEffect(() => {
    let unsub;
    try {
      unsub = Forma.selection.subscribe(async ({ paths }) => {
        if (!paths || paths.length === 0) {
          setSelected(null);
          setStatus("Click a building in Forma to begin");
          return;
        }
        setStatus("Loading…");
        const el = await readFormaElement(paths[0]);
        setSelected(el);
        setStatus(null);
        setActiveTab("Assign");
        syncAllData();
      });
    } catch {
      setSelected(MOCK_BUILDINGS[0]);
      setAllBuildings(MOCK_BUILDINGS);
      setStatus(null);
    }
    return () => { if (typeof unsub === "function") unsub(); };
  }, [syncAllData]);

  useEffect(() => {
    reloadAllBuildings();
    let unsub;
    try {
      unsub = Forma.proposal.subscribe(() => {
        setTimeout(async () => {
          await reloadAllBuildings();
          setSelected(prev => {
            if (!prev) return prev;
            readFormaElement(prev.path).then(setSelected);
            return prev;
          });
          syncAllData();
        }, 300);
      });
    } catch { /* outside Forma */ }
    return () => { if (typeof unsub === "function") unsub(); };
  }, [reloadAllBuildings, syncAllData]);

  useEffect(() => {
    syncAllData();
    if (activeTab !== "Visualize") {
      try { Forma.render.elementColors.clearAll(); Forma.render.unhideAllElements(); }
      catch { /* outside Forma */ }
    }
  }, [activeTab, syncAllData]);

  function handleSave(path, data) {
    saveElementData(path, data);
    syncAllData();
  }

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.headerTitle}>Affordable Housing</div>
        {selected ? (
          <div style={S.headerSub}>
            {selected.floors} fl · {selected.gfaSF.toLocaleString()} SF · {selected.heightFt}ft
            {selected.breakdown?.length > 0 && (
              <span style={{ color: "#4B5563", marginLeft: 6 }}>
                · {selected.breakdown.length} function{selected.breakdown.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ) : (
          <div style={S.headerHint}>{status}</div>
        )}
      </div>

      <div style={S.tabBar}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : S.tabInactive) }}>
            {tab}
          </button>
        ))}
      </div>

      <div style={S.content}>
        {activeTab === "Assign"    && <Assign selected={selected} allData={allData} onSave={handleSave} />}
        {activeTab === "Matrix"    && <Matrix allBuildings={allBuildings} allData={allData} />}
        {activeTab === "Visualize" && <Visualize allBuildings={allBuildings} allData={allData} />}
        {activeTab === "Report"    && <Placeholder label="Report" note="Export — coming next" />}
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
  { path: "/mock/bldg-001", gfaSF: 13200, floors: 6, heightFt: 62, footprintSF: 2200,
    breakdown: [
      { functionId: "res", functionName: "3 Bedroom", functionColor: "#60A5FA", gfaSF: 9900 },
      { functionId: "cor", functionName: "Corridor",  functionColor: "#A78BFA", gfaSF: 3300 },
    ]},
  { path: "/mock/bldg-002", gfaSF: 8500, floors: 3, heightFt: 32, footprintSF: 2125,
    breakdown: [
      { functionId: "res2", functionName: "2 Bedroom", functionColor: "#34D399", gfaSF: 6800 },
      { functionId: "cor",  functionName: "Corridor",  functionColor: "#A78BFA", gfaSF: 1700 },
    ]},
  { path: "/mock/bldg-003", gfaSF: 18400, floors: 8, heightFt: 84, footprintSF: 2300,
    breakdown: [
      { functionId: "res",  functionName: "3 Bedroom", functionColor: "#60A5FA", gfaSF: 11040 },
      { functionId: "res2", functionName: "2 Bedroom", functionColor: "#34D399", gfaSF: 5520 },
      { functionId: "amen", functionName: "Amenity",   functionColor: "#FB923C", gfaSF: 1840 },
    ]},
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
