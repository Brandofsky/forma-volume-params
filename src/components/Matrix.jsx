const FUNCTIONS     = ["3 Bedroom", "2 Bedroom", "1 Bedroom", "Core", "Corridor", "Amenity"];
const FN_SHORT      = { "3 Bedroom": "3 Bed", "2 Bedroom": "2 Bed", "1 Bedroom": "1 Bed", "Core": "Core", "Corridor": "Corr", "Amenity": "Amen" };
const FN_COLOR      = { "3 Bedroom": "#60A5FA", "2 Bedroom": "#34D399", "1 Bedroom": "#FBBF24", "Core": "#F87171", "Corridor": "#A78BFA", "Amenity": "#FB923C" };

export default function Matrix({ elements, allData }) {

  // ── Only count buildings within site ──────────────────────────────────────
  const siteBuildings = elements.filter((el) => allData[el.path]?.withinSite);

  if (siteBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No elements in site</div>
        <div style={S.emptyNote}>
          Go to Assign tab and toggle "Within Site Limit" on for buildings inside your boundary.
        </div>
      </div>
    );
  }

  // ── Figure out which functions are actually used ───────────────────────────
  const usedFunctions = FUNCTIONS.filter((fn) =>
    siteBuildings.some((el) => allData[el.path]?.function === fn)
  );

  // ── Max floor across all site buildings ───────────────────────────────────
  const maxFloor = Math.max(...siteBuildings.map((el) => el.floors));

  // ── Build matrix: matrix[floor][function] = count of buildings ────────────
  // A building contributes 1 unit to floor N if it has >= N floors
  const matrix = {};
  for (let f = 1; f <= maxFloor; f++) {
    matrix[f] = {};
    for (const fn of usedFunctions) {
      matrix[f][fn] = siteBuildings.filter(
        (el) => allData[el.path]?.function === fn && el.floors >= f
      ).length;
    }
  }

  // ── Column totals (total units per function) ──────────────────────────────
  const colTotals = {};
  for (const fn of usedFunctions) {
    colTotals[fn] = siteBuildings
      .filter((el) => allData[el.path]?.function === fn)
      .reduce((sum, el) => sum + el.floors, 0);
  }
  const grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);

  // ── Row totals (total units per floor across all functions) ───────────────
  const rowTotals = {};
  for (let f = 1; f <= maxFloor; f++) {
    rowTotals[f] = usedFunctions.reduce((sum, fn) => sum + (matrix[f][fn] || 0), 0);
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  const totalBuildings    = siteBuildings.length;
  const totalUnits        = grandTotal;
  const uniqueFunctions   = usedFunctions.length;
  const phases            = [...new Set(siteBuildings.map((el) => allData[el.path]?.phase).filter(Boolean))];

  return (
    <div style={S.root}>

      {/* Summary cards */}
      <div style={S.cards}>
        {[
          { label: "Buildings",  value: totalBuildings },
          { label: "Total Units",value: totalUnits },
          { label: "Functions",  value: uniqueFunctions },
          { label: "Phases",     value: phases.length || "—" },
        ].map(({ label, value }) => (
          <div key={label} style={S.card}>
            <div style={S.cardVal}>{value}</div>
            <div style={S.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Function legend */}
      <div style={S.legend}>
        {usedFunctions.map((fn) => (
          <div key={fn} style={S.legendItem}>
            <div style={{ ...S.legendDot, background: FN_COLOR[fn] }} />
            <span>{FN_SHORT[fn]}</span>
          </div>
        ))}
      </div>

      {/* Matrix table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, ...S.thFloor }}>Floor</th>
              {usedFunctions.map((fn) => (
                <th key={fn} style={S.th}>
                  <span style={{ color: FN_COLOR[fn] }}>{FN_SHORT[fn]}</span>
                </th>
              ))}
              <th style={{ ...S.th, color: "#E2E8F0" }}>Σ</th>
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: maxFloor }, (_, i) => i + 1).map((floor) => (
              <tr key={floor} style={floor % 2 === 0 ? S.rowEven : S.rowOdd}>
                <td style={{ ...S.td, ...S.tdFloor }}>
                  {floor}
                </td>
                {usedFunctions.map((fn) => {
                  const count = matrix[floor][fn] || 0;
                  return (
                    <td key={fn} style={S.td}>
                      {count > 0 ? (
                        <span style={{ ...S.cell, color: FN_COLOR[fn] }}>
                          {count}
                        </span>
                      ) : (
                        <span style={S.cellEmpty}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...S.td, ...S.tdSum }}>
                  {rowTotals[floor]}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr style={S.totalRow}>
              <td style={{ ...S.tdTotal, ...S.tdFloor }}>Total</td>
              {usedFunctions.map((fn) => (
                <td key={fn} style={S.tdTotal}>
                  <div style={{ color: FN_COLOR[fn], fontWeight: 700 }}>{colTotals[fn]}</div>
                  <div style={S.pct}>{grandTotal ? Math.round((colTotals[fn] / grandTotal) * 100) : 0}%</div>
                </td>
              ))}
              <td style={{ ...S.tdTotal, ...S.tdSum, color: "#E2E8F0" }}>
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
            const phaseBuildings = siteBuildings.filter((el) => allData[el.path]?.phase === phase);
            const phaseUnits     = phaseBuildings.reduce((sum, el) => sum + el.floors, 0);
            const phasePct       = grandTotal ? Math.round((phaseUnits / grandTotal) * 100) : 0;
            return (
              <div key={phase} style={S.phaseRow}>
                <span style={S.phaseLabel}>{phase}</span>
                <div style={S.phaseBarWrap}>
                  <div style={{ ...S.phaseBar, width: `${phasePct}%` }} />
                </div>
                <span style={S.phaseCount}>{phaseUnits} units · {phasePct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  root:          { display: "flex", flexDirection: "column", padding: "12px 0" },
  empty:         { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10, textAlign: "center" },
  emptyIcon:     { fontSize: 32, opacity: 0.2 },
  emptyTitle:    { fontSize: 14, fontWeight: 700, color: "#E2E8F0", opacity: 0.4 },
  emptyNote:     { fontSize: 12, color: "#4B5563", lineHeight: 1.6 },
  cards:         { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "0 12px 12px" },
  card:          { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "8px 6px", textAlign: "center" },
  cardVal:       { fontSize: 18, fontWeight: 700, color: "#E2E8F0", fontFamily: "monospace" },
  cardLabel:     { fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B7280", marginTop: 2 },
  legend:        { display: "flex", gap: 10, padding: "0 12px 10px", flexWrap: "wrap" },
  legendItem:    { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9CA3AF" },
  legendDot:     { width: 7, height: 7, borderRadius: "50%" },
  tableWrap:     { overflowX: "auto", padding: "0 12px" },
  table:         { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th:            { padding: "7px 6px", textAlign: "center", fontSize: 10, letterSpacing: "0.06em", color: "#6B7280", fontFamily: "monospace", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 600 },
  thFloor:       { textAlign: "left", color: "#4B5563" },
  td:            { padding: "6px 6px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  tdFloor:       { textAlign: "left", color: "#6B7280", fontSize: 11, fontFamily: "monospace", fontWeight: 600 },
  tdSum:         { color: "#E2E8F0", fontWeight: 700, fontFamily: "monospace" },
  cell:          { fontWeight: 700, fontFamily: "monospace", fontSize: 13 },
  cellEmpty:     { color: "#2D3748", fontSize: 12 },
  rowEven:       { background: "rgba(255,255,255,0.015)" },
  rowOdd:        { background: "transparent" },
  totalRow:      { background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.12)" },
  tdTotal:       { padding: "8px 6px", textAlign: "center", fontSize: 12, fontFamily: "monospace" },
  pct:           { fontSize: 9, color: "#6B7280", marginTop: 2 },
  phaseSection:  { padding: "16px 12px 0" },
  sectionLabel:  { fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: "#4B5563", fontFamily: "monospace", marginBottom: 10 },
  phaseRow:      { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  phaseLabel:    { fontSize: 11, color: "#FBBF24", fontFamily: "monospace", width: 56, flexShrink: 0 },
  phaseBarWrap:  { flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 },
  phaseBar:      { height: "100%", background: "#FBBF24", borderRadius: 2, transition: "width 0.4s", opacity: 0.7 },
  phaseCount:    { fontSize: 10, color: "#6B7280", whiteSpace: "nowrap", width: 100, textAlign: "right" },
};
