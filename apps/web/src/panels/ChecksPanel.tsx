import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import type { ResidualDiagnostic } from "@nudagitty/core";

export interface CheckEntry { id: string; label: string; d: ResidualDiagnostic }

type Status = "pass" | "warn" | "fail";
const status = (p: number, warnBelow = 0.1, failBelow = 0.01): Status => (p < failBelow ? "fail" : p < warnBelow ? "warn" : "pass");
const sevRank = (s: ResidualDiagnostic["severity"]) => (s === "violated" ? 2 : s === "weak" ? 1 : 0);

/** A collapsible ledger of the residual (RESIT) checks for every fitted node. Collapsed unless something's
 *  wrong; a "Run checks" button re-permutes; each row jumps to the node's full diagnostics. */
export function ChecksPanel(props: { entries: CheckEntry[]; onRun: () => void; onOpen: (id: string) => void }) {
  const sorted = [...props.entries].sort((a, b) => sevRank(b.d.severity) - sevRank(a.d.severity));
  const issues = sorted.filter((e) => e.d.severity !== "ok").length;
  const [open, setOpen] = useState(issues > 0);
  const [userToggled, setUserToggled] = useState(false);
  // Auto-open when an issue appears (unless the user has taken manual control this session).
  useEffect(() => { if (issues > 0 && !userToggled) setOpen(true); }, [issues, userToggled]);

  const fmtP = (p: number, perms: number) => { const floor = 1 / (perms + 1); return p <= floor + 1e-9 ? `<${floor.toFixed(3)}` : p.toFixed(3); };

  return (
    <section className="checks-panel">
      <button type="button" className="checks-head" onClick={() => { setUserToggled(true); setOpen((o) => !o); }} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="checks-title">Diagnostics</span>
        {issues > 0
          ? <span className="checks-badge fail">{issues} to review</span>
          : sorted.length > 0
            ? <span className="checks-badge ok">all clear</span>
            : <span className="checks-badge none">no checks</span>}
      </button>
      {open && (
        <div className="checks-body">
          <div className="checks-toolbar">
            <button type="button" className="checks-run" onClick={props.onRun} title="Re-run every check with a fresh permutation"><RotateCw size={12} /> Run checks</button>
            <span className="muted">residual tests (RESIT)</span>
          </div>
          {sorted.length === 0 && <p className="muted checks-empty">No checks yet — fit a continuous variable and its noise (ε) is tested automatically.</p>}
          {sorted.map((e) => (
            <div className={`checks-group sev-${e.d.severity}`} key={e.id}>
              <button type="button" className="checks-node" onClick={() => props.onOpen(e.id)} title="Open the full residual diagnostics">
                <span className="cn-label">{e.label}</span>
                <span className={`cn-sev ${e.d.severity}`}>{e.d.severity === "ok" ? "clear" : e.d.severity === "weak" ? "review" : "fail"}</span>
              </button>
              <CheckRow name="exogeneity ε ⊥ X" stat={`dCor ${e.d.independence.dcor.toFixed(2)}`} p={fmtP(e.d.independence.pValue, e.d.perms)} status={status(e.d.independence.pValue)} />
              <CheckRow name="homoskedasticity ε² ⊥ X" stat={`dCor ${e.d.heteroskedasticity.dcor.toFixed(2)}`} p={fmtP(e.d.heteroskedasticity.pValue, e.d.perms)} status={status(e.d.heteroskedasticity.pValue, 0.05, 0.01)} />
              <CheckRow name="Gaussian ε (Jarque–Bera)" stat={`exk ${e.d.normality.excessKurtosis.toFixed(1)}`} p={e.d.normality.pValue < 0.001 ? "<0.001" : e.d.normality.pValue.toFixed(3)} status={e.d.normality.pValue < 0.01 ? "warn" : "pass"} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CheckRow(props: { name: string; stat: string; p: string; status: Status }) {
  const glyph = props.status === "pass" ? "✓" : props.status === "warn" ? "⚠" : "✗";
  return (
    <div className={`check-row ${props.status}`}>
      <span className="cr-name">{props.name}</span>
      <span className="cr-stat">{props.stat}</span>
      <span className="cr-p">p {props.p}</span>
      <span className="cr-glyph" aria-hidden="true">{glyph}</span>
    </div>
  );
}
