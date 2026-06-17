// Matrix logic with new data shape:
// allData[path] = { withinSite, phase, functions: { [functionId]: { costPerSF } } }
// allBuildings[n] = { path, floors, gfaSF, heightFt, footprintSF,
//                     breakdown: [{ functionId, functionName, functionColor, gfaSF }] }
//
// NOTE: breakdown is now read from areaMetrics in App.jsx and passed through allBuildings
// So each building already has per-function GFA — no need to guess or divide by floors.
//
// Matrix rows = floors (1 to maxFloor)
// Matrix cols = unique functions across all site buildings
// Cell value  = number of buildings that have that function AND have floors >= row

const UNIT_FUNCTION_KEYWORDS = ["bedroom", "bed", "br", "studio", "unit", "residential", "apartment"];

function isUnitFunction(name = "") {
  const lower = name.toLowerCase();
  return UNIT_FUNCTION_KEYWORDS.some(k => lower.includes(k));
}

export default function Matrix({ allBuildings, allData }) {

  const siteBuildings = allBuildings.filter(b => allData[b.path]?.withinSite);

  if (siteBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No buildings in site</div>
        <div style={S.emptyNote}>
          Select each building → Assign tab → toggle "Within Site Limit" on
        </div>
      </div>
    );
  }

  // Collect all unique functions across site buildings (from breakdown)
  const fnMap = {}; // functionId → { functionName, functionColor }
  for (const b of siteBuildings) {
    for (const fn of (b.breakdown ?? [])) {
      if (!fnMap[fn.functionId]) {
        fnMap[fn.functionId] = { functionName: fn.functionName, functionColor: fn.functionColor };
      }
    }
  }
  const allFnIds = Object.keys(fnMap);

  if (allFnIds.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>◎</div>
        <div style={S.emptyTitle}>No functions assigned</div>
        <div style={S.emptyNote}>
          In Forma's right panel, open Building → Floor Plans and assign functions to floors, then come back here.
        </div>
      </div>
    );
  }

  const unitFnIds    = allFnIds.filter(id => isUnitFunction(fnMap[id].functionName));
  const supportFnIds = allFnIds.filter(id => !isUnitFunction(fnMap[id].functionName));
  const maxFloor     = Math.max(...siteBuildings.map(b => b.floors));

  // ── Matrix cell: buildings with this function present on this floor ───────
  // A building "has a function on floor f" if:
  //   - it has that function in its breakdown (meaning at least 1 floor uses it)
  //   - AND its total floor count >= f
  // (We don't have per-floor breakdown from areaMetrics, only total GFA per function)
  const matrix = {};
  for (let f = 1; f <= maxFloor; f++) {
    matrix[f] = {};
    for (const fnId of allFnIds) {
      matrix[f][fnId] = siteBuildings.filter(b => {
        const hasFn = (b.breakdown ?? []).some(fn => fn.functionId === fnId);
        return hasFn && b.floors >= f;
      }).length;
    }
  }

  // ── Column totals = sum of floors for buildings that have that function ───
  const colTotals = {};
  for (const fnId of allFnIds) {
    colTotals[fnId] = siteBuildings
      .filter(b => (b.breakdown ?? []).some(fn => fn.functionId === fnId))
      .reduce((sum, b) => sum + b.floors, 0);
  }

  const unitTotal  = unitFnIds.reduce((s, id) => s + (colTotals[id] || 0), 0);
  const grandTotal = allFnIds.reduce((s, id) => s + (colTotals[id] || 0), 0);

  const rowTotals = {};
  for (let f = 1; f <= maxFloor; f++) {
    rowTotals[f] = allFnIds.reduce((s, id) => s + (matrix[f][id] || 0), 0);
  }

  // ── GFA and cost per function across all site buildings ───────────────────
  const fnGFA = {};
  const fnCost = {};
  for (const fnId of allFnIds) {
    fnGFA[fnId] = 0;
    fnCost[fnId] = 0;
    for (const b of siteBuildings) {
      const fn = (b.breakdown ?? []).find(fn => fn.functionId === fnId);
      if (!fn) continue;
      fnGFA[fnId] += fn.gfaSF;
      const cpsf = parseFloat(allData[b.path]?.functions?.[fnId]?.costPerSF) || 0;
      fnCost[fnId] += fn.gfaSF * cpsf;
    }
  }

  const totalGFA  = Object.values(fnGFA).reduce((a, b) => a + b, 0);
  const totalCost = Object.values(fnCost).reduce((a, b) => a + b, 0);
  const phases    = [...new Set(siteBuildings.map(b => allData[b.path]?.phase).filter(Boolean))].sort();

  return (
    <div style={S.root}>

      {/* KPI cards */}
      <div style={S.cards}>
        {[
          { label: "Buildings",    value: siteBuildings.length },
          { label: "Units",        value: unitTotal },
          { label: "Total GFA",    value: totalGFA > 0 ? `${(totalGFA/1000).toFixed(0)}k SF` : "—" },
          { label: "Est. Cost",    value: totalCost > 0 ? `$${(totalCost/1e6).toFixed(1)}M` : "—" },
        ].map(({ label, value }) => (
          <div key={label} style={S.card}>
            <div style={S.cardVal}>{value}</div>
            <div style={S.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        {allFnIds.map(id => {
          const { functionName: name, functionColor: color } = fnMap[id];
          const isUnit = isUnitFunction(name);
          return (
            <div key={id} style={S.legendItem}>
              <div style={{ width: 7, height: 7, borderRadius: isUnit ? "50%" : "2px", background: color, flexShrink: 0 }} />
              <span style={{ color: isUnit ? "#9CA3AF" : "#6B7280" }}>{name}</span>
              {!isUnit && <span style={{ fontSize: 8, color: "#4B5563" }}>(support)</span>}
            </div>
          );
        })}
      </div>

      {/* Matrix table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left", color: "#4B5563" }}>Fl</th>
              {allFnIds.map(id => (
                <th key={id} style={S.th}>
                  <span style={{
                    color: fnMap[id].functionColor,
                    opacity: isUnitFunction(fnMap[id].functionName) ? 1 : 0.5,
                  }}>
                    {fnMap[id].functionName.length > 6
                      ? fnMap[id].functionName.slice(0, 5) + "…"
                      : fnMap[id].functionName}
                  </span>
                </th>
              ))}
              <th style={{ ...S.th, color: "#E2E8F0" }}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxFloor }, (_, i) => i + 1).map(floor => (
              <tr key={floor} style={floor % 2 === 0 ? S.rowEven : {}}>
                <td style={{ ...S.td, color: "#6B7280", fontFamily: "monospace", fontWeight: 600, fontSize: 11 }}>
                  {floor}
                </td>
                {allFnIds.map(id => {
                  const count = matrix[floor][id] || 0;
                  return (
                    <td key={id} style={S.td}>
                      {count > 0
                        ? <span style={{ color: fnMap[id].functionColor, fontWeight: 700, fontFamily: "monospace", fontSize: 13, opacity: isUnitFunction(fnMap[id].functionName) ? 1 : 0.5 }}>{count}</span>
                        : <span style={{ color: "#1F2937" }}>—</span>
                      }
                    </td>
                  );
                })}
                <td style={{ ...S.td, color: "#E2E8F0", fontWeight: 700, fontFamily: "monospace" }}>
                  {rowTotals[floor]}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={S.totalRow}>
              <td style={{ ...S.tdTotal, textAlign: "left", color: "#9CA3AF" }}>Total</td>
              {allFnIds.map(id => {
                const isUnit = isUnitFunction(fnMap[id].functionName);
                return (
                  <td key={id} style={S.tdTotal}>
                    <div style={{ color: fnMap[id].functionColor, fontWeight: 700, opacity: isUnit ? 1 : 0.5 }}>
                      {colTotals[id]}
                    </div>
                    {isUnit
                      ? <div style={S.pct}>{unitTotal ? Math.round((colTotals[id]/unitTotal)*100) : 0}%</div>
                      : <div style={{ ...S.pct, color: "#374151" }}>support</div>
                    }
                  </td>
                );
              })}
              <td style={{ ...S.tdTotal, color: "#E2E8F0" }}>
                <div style={{ fontWeight: 700 }}>{unitTotal}</div>
                <div style={S.pct}>units</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* GFA + Cost breakdown per function */}
      <div style={S.section}>
        <div style={S.sectionLabel}>GFA & Cost by Function</div>
        {allFnIds.map(id => {
          const { functionName: name, functionColor: color } = fnMap[id];
          const gfa  = fnGFA[id];
          const cost = fnCost[id];
          const pct  = totalGFA > 0 ? Math.round((gfa / totalGFA) * 100) : 0;
          return (
            <div key={id} style={S.fnRow}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, color, fontWeight: 600 }}>{name}</span>
                </div>
                <span style={{ fontSize: 10, color: "#6B7280", fontFamily: "monospace" }}>
                  {gfa.toLocaleString()} SF · {pct}%
                  {cost > 0 && <span style={{ color: "#34D399", marginLeft: 6 }}>${Math.round(cost).toLocaleString()}</span>}
                </span>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.6 }} />
              </div>
            </div>
          );
        })}
        {totalCost > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Total Cost</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399", fontFamily: "monospace" }}>
              ${Math.round(totalCost).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Phase breakdown */}
      {phases.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>By Phase</div>
          {phases.map(phase => {
            const pBldgs = siteBuildings.filter(b => allData[b.path]?.phase === phase);
            const pUnits = pBldgs
              .filter(b => (b.breakdown ?? []).some(fn => isUnitFunction(fn.functionName)))
              .reduce((s, b) => s + b.floors, 0);
            const pGFA   = pBldgs.reduce((s, b) => s + b.gfaSF, 0);
            const pPct   = unitTotal ? Math.round((pUnits / unitTotal) * 100) : 0;
            return (
              <div key={phase} style={S.phaseRow}>
                <span style={S.phaseLabel}>{phase}</span>
                <div style={S.track}>
                  <div style={{ ...S.bar, width: `${pPct}%` }} />
                </div>
                <span style={S.phaseCount}>{pUnits} units · {pGFA > 0 ? `${(pGFA/1000).toFixed(0)}k SF` : "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  root:         { display: "flex", flexDirection: "column", paddingBottom: 24 },
  empty:        { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10, textAlign: "center" },
  emptyIcon:    { fontSize: 32, opacity: 0.15 },
  emptyTitle:   { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  emptyNote:    { fontSize: 12, color: "#4B5563", lineHeight: 1.6 },
  cards:        { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "12px 12px 0" },
  card:         { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "8px 6px", textAlign: "center" },
  cardVal:      { fontSize: 15, fontWeight: 700, color: "#E2E8F0", fontFamily: "monospace" },
  cardLabel:    { fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B7280", marginTop: 2 },
  legend:       { display: "flex", gap: 8, padding: "10px 12px 0", flexWrap: "wrap" },
  legendItem:   { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9CA3AF" },
  tableWrap:    { overflowX: "auto", padding: "10px 12px 0" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th:           { padding: "7px 6px", textAlign: "center", fontSize: 10, letterSpacing: "0.06em", color: "#6B7280", fontFamily: "monospace", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 600 },
  td:           { padding: "6px 6px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowEven:      { background: "rgba(255,255,255,0.015)" },
  totalRow:     { background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.1)" },
  tdTotal:      { padding: "8px 6px", textAlign: "center", fontSize: 12, fontFamily: "monospace" },
  pct:          { fontSize: 9, color: "#6B7280", marginTop: 2 },
  section:      { padding: "14px 12px 0" },
  sectionLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 10 },
  fnRow:        { marginBottom: 10 },
  phaseRow:     { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  phaseLabel:   { fontSize: 11, color: "#FBBF24", fontFamily: "monospace", width: 54, flexShrink: 0 },
  track:        { flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 },
  bar:          { height: "100%", background: "#FBBF24", borderRadius: 2, opacity: 0.7 },
  phaseCount:   { fontSize: 10, color: "#6B7280", whiteSpace: "nowrap", width: 100, textAlign: "right" },
};
