// ─── Matrix — per-floor function counts ──────────────────────────────────────
//
// Data source: b.floorFunctions[floorIndex] = Set<functionName>
//   Built in App.jsx by matching graphBuilding.levels[n].spaces[].id
//   against units[].spaceIds[] → units[].properties.function
//   This is the ONLY correct source for per-floor function data.
//   areaMetrics.functionBreakdown gives TOTAL GFA per function, NOT per floor.
//
// Matrix cell[floor][fn]:
//   Count of site buildings where floorFunctions[floor-1].has(fn)
//   i.e. "how many buildings have function X on floor N"
//
// Non-typical plans are handled naturally:
//   If building has Amenity only on floor 1, cell[1][Amenity]=1, cell[2][Amenity]=0

const UNIT_KEYWORDS = ["bedroom", "bed", "br", "studio", "unit", "residential", "apartment", "living"];

function isUnit(name = "") {
  return UNIT_KEYWORDS.some(k => name.toLowerCase().includes(k));
}

export default function Matrix({ allBuildings, allData }) {
  const siteBuildings = allBuildings.filter(b => allData[b.path]?.withinSite);

  if (siteBuildings.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>⬡</div>
        <div style={S.emptyTitle}>No buildings in site</div>
        <div style={S.emptyNote}>Select each building → Assign tab → toggle "Within Site Limit" on</div>
      </div>
    );
  }

  // Collect all unique function names across all site buildings
  const fnNames = new Set();
  for (const b of siteBuildings) {
    for (const fns of (b.floorFunctions ?? [])) {
      for (const fn of fns) fnNames.add(fn);
    }
  }
  const allFns = [...fnNames];

  if (allFns.length === 0) {
    return (
      <div style={S.empty}>
        <div style={S.emptyIcon}>◎</div>
        <div style={S.emptyTitle}>No functions assigned</div>
        <div style={S.emptyNote}>
          In Forma's right panel → Building → Floor Plans → assign functions to floors, then return here.
        </div>
      </div>
    );
  }

  const unitFns   = allFns.filter(isUnit);
  const maxFloor  = Math.max(...siteBuildings.map(b => b.floors));

  // fn color from any building's fnMeta
  function getColor(fnName) {
    for (const b of siteBuildings) {
      const meta = b.fnMeta?.[fnName];
      if (meta?.functionColor) return meta.functionColor;
    }
    return "#94A3B8";
  }

  // ── Matrix cell: exact count from floorFunctions ──────────────────────────
  // cell[floor][fn] = buildings that have fn on that specific floor
  const matrix = {};
  for (let f = 1; f <= maxFloor; f++) {
    matrix[f] = {};
    for (const fn of allFns) {
      matrix[f][fn] = siteBuildings.filter(b => {
        const ffs = b.floorFunctions ?? [];
        // floor index is f-1 (0-based), only count if building has that floor
        return f <= b.floors && ffs[f - 1]?.has(fn);
      }).length;
    }
  }

  // ── Column totals = sum over all floors ───────────────────────────────────
  // This correctly accounts for non-typical plans:
  // If building A has fn on floors 1-5 and building B has fn on floors 2-4 only:
  //   floor 1: 1, floor 2: 2, floor 3: 2, floor 4: 2, floor 5: 1 → total = 8
  const colTotals = {};
  for (const fn of allFns) {
    colTotals[fn] = 0;
    for (let f = 1; f <= maxFloor; f++) {
      colTotals[fn] += matrix[f][fn] || 0;
    }
  }

  const unitTotal  = unitFns.reduce((s, fn) => s + (colTotals[fn] || 0), 0);
  const grandTotal = allFns.reduce((s, fn) => s + (colTotals[fn] || 0), 0);

  const rowTotals = {};
  for (let f = 1; f <= maxFloor; f++) {
    rowTotals[f] = allFns.reduce((s, fn) => s + (matrix[f][fn] || 0), 0);
  }

  // ── GFA and cost per function ─────────────────────────────────────────────
  const fnGFA  = {};
  const fnCost = {};
  for (const fn of allFns) {
    fnGFA[fn]  = 0;
    fnCost[fn] = 0;
    for (const b of siteBuildings) {
      const bfn  = (b.breakdown ?? []).find(bd => bd.functionName === fn);
      if (!bfn) continue;
      fnGFA[fn] += bfn.gfaSF;
      // Find cost from allData using functionId
      const fnId = bfn.functionId;
      const cpsf = parseFloat(allData[b.path]?.functions?.[fnId]?.costPerSF) || 0;
      fnCost[fn] += bfn.gfaSF * cpsf;
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
          { label: "Buildings", value: siteBuildings.length },
          { label: "Unit Floors", value: unitTotal },
          { label: "Total GFA",  value: totalGFA > 0 ? `${(totalGFA/1000).toFixed(0)}k SF` : "—" },
          { label: "Est. Cost",  value: totalCost > 0 ? `$${(totalCost/1e6).toFixed(1)}M` : "—" },
        ].map(({ label, value }) => (
          <div key={label} style={S.card}>
            <div style={S.cardVal}>{value}</div>
            <div style={S.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={S.legend}>
        {allFns.map(fn => {
          const color  = getColor(fn);
          const unit   = isUnit(fn);
          return (
            <div key={fn} style={S.legendItem}>
              <div style={{ width: 7, height: 7, borderRadius: unit ? "50%" : "2px", background: color, flexShrink: 0 }} />
              <span style={{ color: unit ? "#9CA3AF" : "#6B7280" }}>{fn}</span>
              {!unit && <span style={{ fontSize: 8, color: "#4B5563" }}>(support)</span>}
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
              {allFns.map(fn => (
                <th key={fn} style={S.th}>
                  <span style={{ color: getColor(fn), opacity: isUnit(fn) ? 1 : 0.5, fontSize: 9 }}>
                    {fn.length > 6 ? fn.slice(0,5) + "…" : fn}
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
                {allFns.map(fn => {
                  const count = matrix[floor][fn] || 0;
                  const color = getColor(fn);
                  return (
                    <td key={fn} style={S.td}>
                      {count > 0
                        ? <span style={{ color, fontWeight: 700, fontFamily: "monospace", fontSize: 13, opacity: isUnit(fn) ? 1 : 0.45 }}>{count}</span>
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
              {allFns.map(fn => {
                const unit  = isUnit(fn);
                const color = getColor(fn);
                return (
                  <td key={fn} style={S.tdTotal}>
                    <div style={{ color, fontWeight: 700, opacity: unit ? 1 : 0.5 }}>{colTotals[fn]}</div>
                    {unit
                      ? <div style={S.pct}>{unitTotal ? Math.round((colTotals[fn]/unitTotal)*100) : 0}%</div>
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

      {/* GFA + cost by function */}
      <div style={S.section}>
        <div style={S.sectionLabel}>GFA & Cost by Function</div>
        {allFns.map(fn => {
          const color = getColor(fn);
          const gfa   = fnGFA[fn] || 0;
          const cost  = fnCost[fn] || 0;
          const pct   = totalGFA > 0 ? Math.round((gfa / totalGFA) * 100) : 0;
          return (
            <div key={fn} style={S.fnRow}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, color, fontWeight: 600 }}>{fn}</span>
                </div>
                <span style={{ fontSize: 10, color: "#6B7280", fontFamily: "monospace" }}>
                  {gfa.toLocaleString()} SF · {pct}%
                  {cost > 0 && <span style={{ color: "#34D399", marginLeft: 5 }}>${Math.round(cost).toLocaleString()}</span>}
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
            const pb    = siteBuildings.filter(b => allData[b.path]?.phase === phase);
            const pUnit = pb.reduce((s, b) => {
              // Sum only unit-function floors from floorFunctions
              const ffs = b.floorFunctions ?? [];
              return s + ffs.filter(fns => [...fns].some(isUnit)).length;
            }, 0);
            const pGFA  = pb.reduce((s, b) => s + b.gfaSF, 0);
            const pPct  = unitTotal ? Math.round((pUnit / unitTotal) * 100) : 0;
            return (
              <div key={phase} style={S.phaseRow}>
                <span style={S.phaseLabel}>{phase}</span>
                <div style={S.track}>
                  <div style={{ ...S.bar, width: `${pPct}%` }} />
                </div>
                <span style={S.phaseCount}>{pUnit} fl · {pGFA > 0 ? `${(pGFA/1000).toFixed(0)}k SF` : "—"}</span>
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
  legendItem:   { display: "flex", alignItems: "center", gap: 4, fontSize: 11 },
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
