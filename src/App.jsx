import { useState, useEffect } from "react";
import { Forma } from "forma-embedded-view-sdk/auto";
import ParameterPanel from "./components/ParameterPanel.jsx";

// ─── Naming convention parser ─────────────────────────────────────────────────
// Convention: {Phase}_{Department}_{Function}_{Index}
// e.g. P1_Medical_Inpatient_01
const PHASE_MAP = { P1: "Phase 1", P2: "Phase 2", P3: "Phase 3", P4: "Phase 4" };

export function parseName(name = "") {
  const parts = name.split("_");
  return {
    phasing:    PHASE_MAP[parts[0]] || "",
    department: parts[1] || "",
    function:   parts[2] || "",
    index:      parts[3] || "",
  };
}

export default function App() {
  const [volumes, setVolumes]       = useState([]);
  const [selectedPath, setSelected] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ── Load all elements from Forma on mount ──────────────────────────────────
  useEffect(() => {
    async function loadVolumes() {
      try {
        // Get all elements in the Forma scene
        const elements = await Forma.elements.getAll();

        // Filter to volumes (type === "volume" or has geometry)
        const vols = elements
          .filter((el) => el.type === "volume" || el.properties?.area)
          .map((el) => ({
            path:  el.path,
            name:  el.properties?.label || el.path?.split("/").pop() || "Unnamed",
            area:  el.properties?.grossFloorArea || el.properties?.area || 0,
          }));

        setVolumes(vols);
        if (vols.length > 0) setSelected(vols[0].path);
      } catch (err) {
        // Fallback for local dev outside Forma
        console.warn("Forma SDK not available — using mock data", err);
        setVolumes(MOCK_VOLUMES);
        setSelected(MOCK_VOLUMES[0].path);
      } finally {
        setLoading(false);
      }
    }

    loadVolumes();
  }, []);

  // ── Read saved params from Forma element properties ────────────────────────
  async function readParams(path) {
    try {
      const props = await Forma.properties.get({ path });
      return props?.volumeParams || null;
    } catch {
      return null;
    }
  }

  // ── Write params back to Forma element properties ──────────────────────────
  async function saveParams(path, params) {
    await Forma.properties.set({
      path,
      properties: { volumeParams: params },
    });
  }

  if (loading) return <div style={styles.status}>Loading volumes…</div>;
  if (error)   return <div style={styles.status}>Error: {error}</div>;
  if (volumes.length === 0)
    return <div style={styles.status}>No volumes found in this project.</div>;

  const selected = volumes.find((v) => v.path === selectedPath);

  return (
    <div style={styles.root}>
      {/* Volume list */}
      <div style={styles.list}>
        {volumes.map((vol) => (
          <div
            key={vol.path}
            onClick={() => setSelected(vol.path)}
            style={{
              ...styles.row,
              background: vol.path === selectedPath
                ? "rgba(96,165,250,0.12)"
                : "transparent",
              borderLeft: vol.path === selectedPath
                ? "2px solid #60A5FA"
                : "2px solid transparent",
            }}
          >
            <span style={styles.rowName}>{vol.name}</span>
            <span style={styles.rowMeta}>
              {parseName(vol.name).phasing || "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Parameter panel */}
      {selected && (
        <ParameterPanel
          volume={selected}
          parseName={parseName}
          readParams={readParams}
          saveParams={saveParams}
        />
      )}
    </div>
  );
}

// ── Mock volumes for local dev outside Forma ──────────────────────────────────
const MOCK_VOLUMES = [
  { path: "/root/vol-001", name: "P1_Medical_Inpatient_01",    area: 12400 },
  { path: "/root/vol-002", name: "P1_Medical_ICU_01",          area: 5800  },
  { path: "/root/vol-003", name: "P2_Administrative_Office_01",area: 8200  },
  { path: "/root/vol-004", name: "P1_Support_Circulation_01",  area: 3100  },
  { path: "/root/vol-005", name: "Unnamed_Volume",             area: 4500  },
];

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#0F1117",
    color: "#E2E8F0",
    fontSize: 13,
  },
  list: {
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    overflowY: "auto",
    maxHeight: "35vh",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  rowName: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#E2E8F0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  rowMeta: {
    fontSize: 10,
    color: "#60A5FA",
    fontFamily: "monospace",
    marginLeft: 8,
  },
  status: {
    padding: 20,
    color: "#6B7280",
    fontSize: 13,
    fontFamily: "monospace",
  },
};
