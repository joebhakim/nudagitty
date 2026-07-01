import type { NodeDistribution } from "@nudagitty/core";
import { TactileNumberField } from "../controls";
import { defaultDistribution } from "../compute/distributionPlot";
import { formatPercent } from "../shared/formatting";

export function DistributionEditor(props: { label: string; distribution: NodeDistribution; onChange: (distribution: NodeDistribution) => void }) {
  const distribution = props.distribution;
  return (
    <div className="distribution-editor">
      <label className="field">
        <span>{props.label}</span>
        <select value={distribution.kind} onChange={(event) => props.onChange(defaultDistribution(event.target.value as NodeDistribution["kind"]))}>
          <option value="constant">constant</option>
          <option value="normal">normal</option>
          <option value="lognormal">lognormal</option>
          <option value="uniform">uniform</option>
          <option value="bernoulli">bernoulli</option>
          <option value="poisson">poisson</option>
          <option value="beta">beta</option>
          <option value="laplace">laplace</option>
          <option value="student_t">Student-t</option>
          <option value="gamma">gamma</option>
          <option value="exponential">exponential</option>
          <option value="categorical">categorical</option>
        </select>
      </label>
      {distribution.kind === "constant" && <TactileNumberField
        key="constant-value"
        label="value"
        value={distribution.value}
        min={distribution.value - 10}
        max={distribution.value + 10}
        step={0.1}
        onChange={(value) => props.onChange({ ...distribution, value })}
      />}
      {distribution.kind === "normal" && <>
        <TactileNumberField
          key="normal-mean"
          label="mean"
          value={distribution.mean}
          min={distribution.mean - 10}
          max={distribution.mean + 10}
          step={0.1}
          onChange={(mean) => props.onChange({ ...distribution, mean })}
        />
        <TactileNumberField
          key="normal-sd"
          label="sd"
          value={distribution.sd}
          min={0.001}
          max={Math.max(10, distribution.sd * 3)}
          step={0.1}
          onChange={(sd) => props.onChange({ ...distribution, sd })}
        />
      </>}
      {distribution.kind === "lognormal" && <>
        <TactileNumberField label="log mean" value={distribution.meanLog} step={0.1} nudge={1} onChange={(meanLog) => props.onChange({ ...distribution, meanLog })} />
        <TactileNumberField label="log sd" value={distribution.sdLog} min={0.001} step={0.1} nudge={1} onChange={(sdLog) => props.onChange({ ...distribution, sdLog })} />
      </>}
      {distribution.kind === "uniform" && <>
        <TactileNumberField label="min" value={distribution.min} step={0.1} nudge={1} onChange={(min) => props.onChange({ ...distribution, min })} />
        <TactileNumberField label="max" value={distribution.max} step={0.1} nudge={1} onChange={(max) => props.onChange({ ...distribution, max })} />
      </>}
      {distribution.kind === "bernoulli" && <TactileNumberField key="bernoulli-p" label="p" value={distribution.p} min={0} max={1} step={0.01} nudge={0.01} onChange={(p) => props.onChange({ ...distribution, p })} />}
      {distribution.kind === "poisson" && <TactileNumberField label="lambda" value={distribution.lambda} min={0.001} step={0.1} nudge={1} onChange={(lambda) => props.onChange({ ...distribution, lambda })} />}
      {distribution.kind === "beta" && <>
        <TactileNumberField label="alpha" value={distribution.alpha} min={0.001} step={0.1} nudge={1} onChange={(alpha) => props.onChange({ ...distribution, alpha })} />
        <TactileNumberField label="beta" value={distribution.beta} min={0.001} step={0.1} nudge={1} onChange={(beta) => props.onChange({ ...distribution, beta })} />
      </>}
      {distribution.kind === "laplace" && <>
        <TactileNumberField label="mean" value={distribution.mean} step={0.1} nudge={1} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "student_t" && <>
        <TactileNumberField label="mean" value={distribution.mean} step={0.1} nudge={1} onChange={(mean) => props.onChange({ ...distribution, mean })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
        <TactileNumberField label="df" value={distribution.df} min={0.001} step={0.1} nudge={1} onChange={(df) => props.onChange({ ...distribution, df })} />
      </>}
      {distribution.kind === "gamma" && <>
        <TactileNumberField label="shape" value={distribution.shape} min={0.001} step={0.1} nudge={1} onChange={(shape) => props.onChange({ ...distribution, shape })} />
        <TactileNumberField label="scale" value={distribution.scale} min={0.001} step={0.1} nudge={1} onChange={(scale) => props.onChange({ ...distribution, scale })} />
      </>}
      {distribution.kind === "exponential" && <TactileNumberField label="rate" value={distribution.rate} min={0.001} step={0.1} nudge={1} onChange={(rate) => props.onChange({ ...distribution, rate })} />}
      {distribution.kind === "categorical" && (() => {
        const weights = distribution.weights;
        const setWeights = (next: number[]) => props.onChange({ ...distribution, weights: next });
        const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0) || 1;
        return (
          <div className="categorical-editor">
            <label className="field">
              <span>levels</span>
              <select value={weights.length} onChange={(event) => {
                const k = parseInt(event.target.value, 10);
                setWeights(Array.from({ length: k }, (_, i) => weights[i] ?? 1));
              }}>
                {[2, 3, 4, 5, 6].map((k) => <option value={k} key={k}>{k}</option>)}
              </select>
            </label>
            {weights.map((weight, index) => (
              <TactileNumberField
                key={`cat-${index}`}
                label={`level ${index} · ${formatPercent(Math.max(0, weight) / total)}`}
                value={weight}
                min={0}
                step={0.1}
                nudge={1}
                onChange={(value) => setWeights(weights.map((w, i) => (i === index ? value : w)))}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
}
