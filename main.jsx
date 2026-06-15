const FUNCTIONS  = ["3 Bedroom", "2 Bedroom", "1 Bedroom", "Core", "Corridor", "Amenity"];
const FN_SHORT   = { "3 Bedroom": "3 Bed", "2 Bedroom": "2 Bed", "1 Bedroom": "1 Bed", "Core": "Core", "Corridor": "Corr", "Amenity": "Amen" };
const FN_COLOR   = { "3 Bedroom": "#60A5FA", "2 Bedroom": "#34D399", "1 Bedroom": "#FBBF24", "Core": "#F87171", "Corridor": "#A78BFA", "Amenity": "#FB923C" };

export default function Matrix({ allBuildings, allData }) {

  // Only buildings toggled "within site" in Assign tab
  const siteBuildings = allBuildings.filter((b) => allData[b.path]?.withinSite);

  if (siteBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No buildings in site</div>
        <div style={S.emptyNote}>
          Select each building in Forma → Assign tab → toggle "Within Site Limit" on
        </div>
      </div>
    );
  }

  // Functions actually used in site
  const usedFns = FUNCTIONS.filter((fn) =>
    siteBuildings.some((b) => allData[b.path]?.function === fn)
  );

  // Max floor across all site buildings (from REAL Forma data)
  const maxFloor = Math.max(...siteBuildings.map((b) => b.floors));

  // Matrix: matrix[floor][fn] = count of buildings that have that fn AND reach that floor
  // 1 unit per floor per building — count of buildings = count of units on that floor
  const matrix = {};
  for (let f = 1; f <= maxFloor; f++) {
    matrix[f] = {};
    for (const fn of usedFns) {
      matrix[f][fn] = siteBuildings.filter(
        (b) => allData[b.path]?.function === fn && b.floors >= f
      ).length;
    }
  }

  // Column totals = sum of floors for each function type
  const colTotals = {};
  for (const fn of usedFns) {
    colTotals[fn] = siteBuildings
      .filter((b) => allData[b.path]?.function === fn)
      .reduce((sum, b) => sum + b.floors, 0);
  }
  const grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);

  // Row totals
  const rowTotals = {};
  for (let f = 1; f <= maxFloor; f++) {
    rowTotals[f] = usedFns.reduce((sum, fn) => sum + (matrix[f][fn] || 0), 0);
  }

  // Total GFA across site buildings (live from Forma)
  const totalGFA   = siteBuildings.reduce((sum, b) => sum + b.gfaSF, 0);
  const totalCost  = siteBuildings.reduce((sum, b) => {
    const d = allData[b.path];
    return sum + (d?.costPerSF ? b.gfaSF * parseFloat(d.costPerSF) : 0);
  }, 0);
  const phases     = [...new Set(siteBuildings.map((b) => allData[b.path]?.phase).filter(Boolean))];

  return (
    <div style={S.root}>

      {/* KPI cards */}
      <div style={S.cards}>
        {[
          { label: "Buildings",   value: siteBuildings.length },
          { label: "Total Units", value: grandTotal },
          { label: "Total GFA",   value: `${(totalGFA / 1000).toFixed(0)}k SF` },
          { label: "Est. Cost",   value: totalCost > 0 ? `$${(totalCost / 1e6).toFixed(1)}M` : "—" },
        ].map(({ label, value }) => (
          <div key={label} style={S.card}>
            <div style={S.cardVal}>{value}</div>
            <div style={S.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        {usedFns.map((fn) => (
          <div key={fn} style={S.legendItem}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: FN_COLOR[fn], flexShrink: 0 }} />
            <span>{FN_SHORT[fn]}</span>
          </div>
        ))}
      </div>

      {/* Matrix table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left", color: "#4B5563" }}>Fl</th>
              {usedFns.map((fn) => (
                <th key={fn} style={S.th}>
                  <span style={{ color: FN_COLOR[fn] }}>{FN_SHORT[fn]}</span>
                </th>
              ))}
              <th style={{ ...S.th, color: "#E2E8F0" }}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxFloor }, (_, i) => i + 1).map((floor) => (
              <tr key={floor} style={floor % 2 === 0 ? S.rowEven : {}}>
                <td style={{ ...S.td, color: "#6B7280", fontFamily: "monospace", fontWeight: 600, fontSize: 11 }}>
                  {floor}
                </td>
                {usedFns.map((fn) => {
                  const count = matrix[floor][fn] || 0;
                  return (
                    <td key={fn} style={S.td}>
                      {count > 0
                        ? <span style={{ color: FN_COLOR[fn], fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{count}</span>
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
              {usedFns.map((fn) => (
                <td key={fn} style={S.tdTotal}>
                  <div style={{ color: FN_COLOR[fn], fontWeight: 700 }}>{colTotals[fn]}</div>
                  <div style={S.pct}>{grandTotal ? Math.round((colTotals[fn] / grandTotal) * 100) : 0}%</div>
                </td>
              ))}
              <td style={{ ...S.tdTotal, color: "#E2E8F0" }}>
                <div style={{ fontWeight: 700 }}>{grandTotal}</div>
                <div style={S.pct}>100%</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phase breakdown */}
      {phases.length > 0 && (
        <div style={S.phaseSection}>
          <div style={S.sectionLabel}>By Phase</div>
          {phases.sort().map((phase) => {
            const pBuildings = siteBuildings.filter((b) => allData[b.path]?.phase === phase);
            const pUnits     = pBuildings.reduce((s, b) => s + b.floors, 0);
            const pPct       = grandTotal ? Math.round((pUnits / grandTotal) * 100) : 0;
            return (
              <div key={phase} style={S.phaseRow}>
                <span style={S.phaseLabel}>{phase}</span>
                <div style={S.phaseTrack}>
                  <div style={{ ...S.phaseBar, width: `${pPct}%` }} />
                </div>
                <span style={S.phaseCount}>{pUnits} · {pPct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  root:         { display: "flex", flexDirection: "column", padding: "10px 0 24px" },
  empty:        { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10, textAlign: "center" },
  emptyIcon:    { fontSize: 32, opacity: 0.15 },
  emptyTitle:   { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.3 },
  emptyNote:    { fontSize: 12, color: "#4B5563", lineHeight: 1.6 },
  cards:        { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "0 12px 10px" },
  card:         { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "8px 6px", textAlign: "center" },
  cardVal:      { fontSize: 15, fontWeight: 700, color: "#E2E8F0", fontFamily: "monospace" },
  cardLabel:    { fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B7280", marginTop: 2 },
  legend:       { display: "flex", gap: 10, padding: "0 12px 10px", flexWrap: "wrap" },
  legendItem:   { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9CA3AF" },
  tableWrap:    { overflowX: "auto", padding: "0 12px" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th:           { padding: "7px 6px", textAlign: "center", fontSize: 10, letterSpacing: "0.06em", color: "#6B7280", fontFamily: "monospace", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 600 },
  td:           { padding: "6px 6px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowEven:      { background: "rgba(255,255,255,0.015)" },
  totalRow:     { background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.1)" },
  tdTotal:      { padding: "8px 6px", textAlign: "center", fontSize: 12, fontFamily: "monospace" },
  pct:          { fontSize: 9, color: "#6B7280", marginTop: 2 },
  phaseSection: { padding: "14px 12px 0" },
  sectionLabel: { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 10 },
  phaseRow:     { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  phaseLabel:   { fontSize: 11, color: "#FBBF24", fontFamily: "monospace", width: 54, flexShrink: 0 },
  phaseTrack:   { flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 },
  phaseBar:     { height: "100%", background: "#FBBF24", borderRadius: 2, opacity: 0.7, transition: "width 0.4s" },
  phaseCount:   { fontSize: 10, color: "#6B7280", whiteSpace: "nowrap", width: 70, textAlign: "right" },
};
