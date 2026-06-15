import { useState, useEffect } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import Assign from "./components/Assign.jsx";
import Matrix from "./components/Matrix.jsx";

// ─── Storage helpers (lesson learned: Forma.properties doesn't exist) ─────────
const STORAGE_KEY = "forma-affordable-housing-v1";

export function loadAllData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveElementData(path, data) {
  const all = loadAllData();
  all[path] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// ─── Mock elements for dev outside Forma ──────────────────────────────────────
const MOCK_ELEMENTS = [
  { path: "/el/bldg-001", name: "Building_01", floors: 6 },
  { path: "/el/bldg-002", name: "Building_02", floors: 4 },
  { path: "/el/bldg-003", name: "Building_03", floors: 8 },
  { path: "/el/bldg-004", name: "Building_04", floors: 3 },
  { path: "/el/bldg-005", name: "Building_05", floors: 10 },
];

const TABS = ["Assign", "Matrix", "Visualize", "Report"];

export default function App() {
  const [activeTab, setActiveTab] = useState("Assign");
  const [elements, setElements]   = useState([]);
  const [allData, setAllData]     = useState(loadAllData());
  const [loading, setLoading]     = useState(true);

// ── Reactively load elements whenever the proposal changes ─────────────────
useEffect(() => {
  async function loadElements() {
    try {
      const paths = await Forma.elements.getPathsInGroundPlane();
      const els = await Promise.all(
        paths.map(async (path) => {
          try {
            const props = await Forma.elements.getPropertiesByPath({ path });
            return {
              path,
              name:   props?.label || path.split("/").pop(),
              floors: props?.floorCount || props?.floors || 1,
            };
          } catch {
            return { path, name: path.split("/").pop(), floors: 1 };
          }
        })
      );
      setElements(els.filter(Boolean));
    } catch {
      // Outside Forma — use mock data, no subscription needed
      setElements(MOCK_ELEMENTS);
    } finally {
      setLoading(false);
    }
  }

  // Load immediately on mount
  loadElements();

  // ← THE FIX: subscribe to proposal changes → reload elements on every change
  let unsubscribe;
  try {
    unsubscribe = Forma.proposal.subscribe(() => {
      loadElements();
    });
  } catch {
    // Outside Forma — polling fallback every 3 seconds for dev
    const interval = setInterval(loadElements, 3000);
    unsubscribe = () => clearInterval(interval);
  }

  // Cleanup on unmount
  return () => {
    if (typeof unsubscribe === "function") unsubscribe();
  };
}, []);

  // Refresh allData from localStorage whenever tab changes
  useEffect(() => {
    setAllData(loadAllData());
  }, [activeTab]);

  function handleSave(path, data) {
    saveElementData(path, data);
    setAllData(loadAllData());
  }

  if (loading) {
    return <div style={S.status}>Loading elements…</div>;
  }

  return (
    <div style={S.root}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...S.tab,
              ...(activeTab === tab ? S.tabActive : S.tabInactive),
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={S.content}>
        {activeTab === "Assign" && (
          <Assign
            elements={elements}
            allData={allData}
            onSave={handleSave}
          />
        )}
        {activeTab === "Matrix" && (
          <Matrix elements={elements} allData={allData} />
        )}
        {activeTab === "Visualize" && (
          <Placeholder label="Visualize" note="Charts coming soon" />
        )}
        {activeTab === "Report" && (
          <Placeholder label="Report" note="Export coming soon" />
        )}
      </div>
    </div>
  );
}

function Placeholder({ label, note }) {
  return (
    <div style={S.placeholder}>
      <div style={S.placeholderLabel}>{label}</div>
      <div style={S.placeholderNote}>{note}</div>
    </div>
  );
}

const S = {
  root:             { display: "flex", flexDirection: "column", height: "100vh", background: "#0F1117", color: "#E2E8F0", fontFamily: "Inter, sans-serif", fontSize: 13 },
  tabBar:           { display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 },
  tab:              { flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", transition: "all 0.15s" },
  tabActive:        { background: "#0F1117", color: "#60A5FA", borderBottom: "2px solid #60A5FA" },
  tabInactive:      { background: "transparent", color: "#4B5563", borderBottom: "2px solid transparent" },
  content:          { flex: 1, overflowY: "auto" },
  status:           { padding: 20, color: "#6B7280", fontFamily: "monospace", fontSize: 12 },
  placeholder:      { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: 0.4 },
  placeholderLabel: { fontSize: 16, fontWeight: 700, color: "#E2E8F0" },
  placeholderNote:  { fontSize: 12, color: "#6B7280" },
};
