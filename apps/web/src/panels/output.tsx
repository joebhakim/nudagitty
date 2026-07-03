import type { ContinuousEffectComparison, CovariateBasis, GMethodsComparison } from "@nudagitty/core";
import { ContinuousEffectReadout } from "../outputs/ContinuousEffectReadout";
import type { ScatterPoint } from "../charts/CategoryOutcomePlot";
import { AuxEstimandStructure, UnifiedAdjustmentReadout, computeStructuralDiagnosis } from "../outputs/modules";
import type { ComputedCompletedOutput } from "../outputs/modules";
import { CompletedOutputPanel } from "../outputs/CompletedOutputPanel";
import { DisambiguationCard } from "../outputs/DisambiguationCard";
import { disambiguationTermForExample } from "../shared/disambiguation";
import { resultPendingActive } from "../compute/relationSummary";
import type { BinaryAdjustmentOutput, BinaryContinuousAdjustmentOutput, ResultPendingState, ShowcaseGuide } from "../app/types";
import { ResultsPendingNotice } from "./ScatterplotPanel";

export function showcaseGuideForExample(exampleId: string | null | undefined): ShowcaseGuide | null {
  if (exampleId === "what-if-dynamic-g-formula") {
    return {
      title: "Sequential dynamic strategy",
      target: "Look for the rule trace and support by visit.",
      items: [
        "The strategy assigns A0/A1/A2 from current risk history before later nodes are drawn.",
        "Observed match is a support diagnostic, not the estimand."
      ]
    };
  }
  if (exampleId === "what-if-nhefs-mortality-survival") {
    return {
      title: "Strategy survival curves",
      target: "Look for two curves and the final risk difference.",
      items: [
        "Each treatment strategy gets its own simulated follow-up curve.",
        "The absorbing death edges chain the interval death indicators, so death in one interval carries into every later one."
      ]
    };
  }
  if (exampleId === "what-if-hazard-selection") {
    return {
      title: "Survivor denominators",
      target: "Open interval denominators under the curve.",
      items: [
        "Late hazards are conditional on remaining at risk.",
        "At-risk counts prevent reading a late interval as the whole-horizon risk."
      ]
    };
  }
  if (exampleId === "what-if-weight-gain-g-estimation") {
    return {
      title: "G-estimation readout",
      target: "Methods is open; inspect additive g-estimation.",
      items: [
        "The top metric uses the additive g-estimation row.",
        "The diagnostic row reports sequential blip coefficients."
      ]
    };
  }
  if (exampleId === "what-if-censoring-ipcw") {
    return {
      title: "Censoring weights",
      target: "Methods is open; inspect IPW/IPCW.",
      items: [
        "The IPW/IPCW metric weights treatment histories and remaining uncensored.",
        "Support ESS tells whether the weighted contrast is fragile."
      ]
    };
  }
  if (exampleId === "what-if-snaft-survival") {
    return {
      title: "Structural nested survival time",
      target: "Separate failure time from observed death.",
      items: [
        "The main contrast is on failure time, not only an event indicator.",
        "Observed-death survival is a follow-up diagnostic."
      ]
    };
  }
  return null;
}

export function ShowcaseGuideCard(props: { guide: ShowcaseGuide }) {
  return (
    <section className="showcase-guide-card" aria-label="Showcase guide">
      <div className="module-card-header">
        <strong>Showcase guide</strong>
        <span>{props.guide.title}</span>
      </div>
      <p>{props.guide.target}</p>
      <ul>
        {props.guide.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

export function AdjustedOutputPanel(props: {
  moduleId: string | null;
  exampleId?: string | null;
  computedOutput: ComputedCompletedOutput | null;
  auxDiagnosis?: ReturnType<typeof computeStructuralDiagnosis>;
  binaryOutput: BinaryAdjustmentOutput | null;
  continuousOutput: BinaryContinuousAdjustmentOutput | null;
  unified?: { comparison: GMethodsComparison; outcomeScale: "risk" | "mean"; outcomeUnit: string; points?: ScatterPoint[]; treatmentId?: string } | null;
  continuousEffect?: { comparison: ContinuousEffectComparison; xLabel: string; yLabel: string } | null;
  basis?: CovariateBasis;
  onBasisChange?: (basis: CovariateBasis) => void;
  pending?: ResultPendingState;
  hideOracle?: boolean;
}) {
  const unifiedPanel = props.unified
    ? <UnifiedAdjustmentReadout comparison={props.unified.comparison} outcomeScale={props.unified.outcomeScale} outcomeUnit={props.unified.outcomeUnit} points={props.unified.points} treatmentId={props.unified.treatmentId} basis={props.basis} onBasisChange={props.onBasisChange} />
    : null;
  // Continuous-exposure analog of the unified panel: the dose-response method comparison.
  const continuousPanel = props.continuousEffect
    ? <ContinuousEffectReadout comparison={props.continuousEffect.comparison} xLabel={props.continuousEffect.xLabel} yLabel={props.continuousEffect.yLabel} />
    : null;
  const adjustedNodes = props.binaryOutput?.adjustedNodes ?? props.continuousOutput?.adjustedNodes ?? [];
  const binaryOutput = props.binaryOutput;
  const continuousOutput = props.continuousOutput;
  const pendingNotice = <ResultsPendingNotice pending={props.pending} label="Updating adjusted output" />;
  const showcaseGuide = showcaseGuideForExample(props.exampleId);
  // Term-disambiguation reference card: shows whenever the active example instantiates a catalogued
  // phenomenon (its cross-field names, what it's confused with, anchoring papers).
  const disambiguationTerm = disambiguationTermForExample(props.exampleId);
  const disambiguationCard = disambiguationTerm ? <DisambiguationCard term={disambiguationTerm} /> : null;
  // Either an example-specific module, or the generic structural diagnosis fallback
  // (computedOutput.moduleId === "structural-diagnosis") when the example has none.
  const effectiveModuleId = props.moduleId ?? props.computedOutput?.moduleId ?? null;
  const showGenericAdjustmentCards = !effectiveModuleId?.startsWith("what-if-");
  if (effectiveModuleId) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {showcaseGuide && <ShowcaseGuideCard guide={showcaseGuide} />}
        {disambiguationCard}
        {showGenericAdjustmentCards && (unifiedPanel ?? continuousPanel)}
        <CompletedOutputPanel moduleId={effectiveModuleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
        {showGenericAdjustmentCards && effectiveModuleId !== "structural-diagnosis" && <AuxEstimandStructure diagnosis={props.auxDiagnosis ?? null} />}
      </div>
    );
  }
  if (unifiedPanel) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {disambiguationCard}
        {unifiedPanel}
      </div>
    );
  }
  if (continuousPanel) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {disambiguationCard}
        {continuousPanel}
      </div>
    );
  }
  if (adjustedNodes.length === 0) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        {disambiguationCard ?? <AdjustedOutputEmptyState />}
      </div>
    );
  }
  if (!props.moduleId) {
    return (
      <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
        {pendingNotice}
        <div className="adjusted-output-empty">
          <strong>Adjusted variables selected</strong>
          <p>{adjustedNodes.map((node) => node.label).join(", ")} marked adjusted. This custom graph does not have a specialized adjusted-output module yet.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="adjusted-output-stack" aria-busy={resultPendingActive(props.pending)}>
      {pendingNotice}
      {disambiguationCard}
      <CompletedOutputPanel moduleId={props.moduleId} computedOutput={props.computedOutput} hideOracle={props.hideOracle} />
    </div>
  );
}

export function AdjustedOutputEmptyState() {
  return (
    <div className="adjusted-output-empty">
      <strong>No adjustment yet</strong>
      <p>Select a pre-treatment common cause, mark it adjusted, and this panel will show the adjusted comparison or example-specific reveal.</p>
    </div>
  );
}
