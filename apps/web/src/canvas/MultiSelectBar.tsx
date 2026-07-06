// Floating action bar shown when ≥2 nodes are multi-selected (Shift+drag marquee / Shift-click, or a
// mobile long-press). Move-together and delete come from react-flow; the causal group actions —
// wire→target, mark-adjusted, group-into-a-cloud — are the point.
export function MultiSelectBar(props: {
  count: number;
  wireArmed: boolean;
  onWire: () => void;
  onAdjust: () => void;
  onCouple: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="multiselect-bar" role="toolbar" aria-label="Selected variables">
      <span className="multiselect-count">{props.count} selected</span>
      {props.wireArmed ? (
        <span className="multiselect-hint">Click the target variable to point them all at it…</span>
      ) : (
        <>
          <button type="button" onClick={props.onWire} title="Draw an arrow from each selected variable into a target you pick next">→ Wire to a target…</button>
          <button type="button" onClick={props.onAdjust} title="Set the 'adjust for' role on all selected (confounders)">Adjust for all</button>
          <button type="button" onClick={props.onCouple} title="Give the selected covariates one shared hidden cause (a copula joint)">☁ Group into a cloud</button>
          <button type="button" className="multiselect-danger" onClick={props.onDelete} title="Delete all selected variables">Delete</button>
        </>
      )}
      <button type="button" className="multiselect-clear" onClick={props.onClear} aria-label="Clear selection">✕</button>
    </div>
  );
}
