import type React from "react";
import { useEffect, useState } from "react";
import { clamp, formatInputNumber } from "../shared/formatting";
import { trimNumber } from "../compute/format";
import { roundToStep } from "../compute/conditioning";
import type { ModuleTone } from "../app/types";

export function PendingChip({ pending, label }: { pending: boolean; label?: string }) {
  if (!pending) return null;
  return (
    <span className="pending-chip">
      <span className="pending-spinner" aria-hidden="true" />
      {label ?? "updating"}
    </span>
  );
}

export function Section({ title, pending, children }: { title: string; pending?: boolean; children: React.ReactNode }) {
  return (
    <section className="panel-section" aria-busy={pending}>
      <div className="panel-section-title">
        <h2>{title}</h2>
        <PendingChip pending={Boolean(pending)} />
      </div>
      {children}
    </section>
  );
}


export function ModuleFrame({
  children,
  className,
  ...headerProps
}: {
  tone: ModuleTone;
  label: string;
  title: string;
  detail: string;
  pending?: boolean;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`module-frame ${headerProps.tone}${className ? ` ${className}` : ""}`}>
      <PaneHeader {...headerProps} />
      <div className="module-pane-body">{children}</div>
    </div>
  );
}

export function PaneHeader({
  tone,
  label,
  title,
  detail,
  pending,
  action
}: {
  tone: ModuleTone;
  label: string;
  title: string;
  detail: string;
  pending?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={`module-pane-header ${tone}`}>
      <div className="module-pane-heading">
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <div className="module-pane-header-actions">
        <PendingChip pending={Boolean(pending)} />
        {action}
      </div>
    </div>
  );
}

export function IconButton({ label, active, pressed, disabled, onClick, children, badge }: { label: string; active?: boolean; pressed?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; badge?: "warning" | "violated" | null }) {
  return <button type="button" className={active ? "icon-button active" : "icon-button"} title={badge ? `${label} (positivity ${badge === "violated" ? "likely violated" : "looks weak"})` : label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}{badge ? <span className={`icon-button-badge ${badge}`} aria-hidden="true">!</span> : null}<span className="icon-button-label">{label}</span></button>;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

export function RoleToggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label
      className={`role-toggle${checked ? " active" : ""}${disabled ? " disabled" : ""}`}
      title={disabled ? "Offered only on a structural instrument candidate (feeds the exposure, no other path to the outcome)." : undefined}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export function RadioGroup({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div>{options.map(([id, label]) => <label className="check-row" key={id}><input type="radio" checked={value === id} onChange={() => onChange(id)} /><span>{label}</span></label>)}</div>;
}

export function NumberField({ label, value, min, max, step = 0.1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={formatInputNumber(value)} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function TactileNumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  nudge = 1,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  nudge?: number;
  onChange: (value: number) => void;
}) {
  const [range, setRange] = useState(() => tactileSliderRange(min, max, value, nudge));
  useEffect(() => {
    setRange((current) => {
      const next = tactileSliderRange(min, max, value, nudge);
      if (value < current.min || value > current.max) return next;
      if ((min !== undefined && current.min < min) || (max !== undefined && current.max > max)) return next;
      return current;
    });
  }, [max, min, nudge, value]);
  const sliderValue = clamp(value, range.min, range.max);
  const smallNudge = Math.max(Math.abs(nudge), Math.abs(step), Number.EPSILON);
  const smallLabel = trimNumber(smallNudge);
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(clampNumber(roundToStep(next, step), min, max));
  };
  const nudgeBy = (delta: number) => commit(value + delta);
  const nudgePercent = (direction: -1 | 1) => {
    const rangeFallback = Math.max(Math.abs(range.max - range.min) * 0.1, smallNudge);
    const magnitude = value === 0 ? rangeFallback : Math.abs(value) * 0.1;
    commit(value + direction * magnitude);
  };
  return (
    <div className="tactile-number-field">
      <div className="tactile-number-head">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          value={formatInputNumber(value)}
          min={min}
          max={max}
          step={step}
          onChange={(event) => commit(Number(event.target.value))}
        />
      </div>
      <div className="tactile-number-controls">
        <button type="button" aria-label={`${label} decrease 10 percent`} onClick={() => nudgePercent(-1)}>-10%</button>
        <button type="button" aria-label={`${label} decrease ${smallLabel}`} onClick={() => nudgeBy(-smallNudge)}>-{smallLabel}</button>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={range.min}
          max={range.max}
          step={step}
          value={sliderValue}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <button type="button" aria-label={`${label} increase ${smallLabel}`} onClick={() => nudgeBy(smallNudge)}>+{smallLabel}</button>
        <button type="button" aria-label={`${label} increase 10 percent`} onClick={() => nudgePercent(1)}>+10%</button>
      </div>
    </div>
  );
}

function tactileSliderRange(min: number | undefined, max: number | undefined, value: number, nudge: number): { min: number; max: number } {
  const magnitude = Math.max(Math.abs(value) * 2, Math.abs(nudge) * 100, 100);
  let safeMin = min ?? value - magnitude;
  let safeMax = max ?? value + magnitude;
  if (safeMin > safeMax) {
    const nextMin = safeMax;
    safeMax = safeMin;
    safeMin = nextMin;
  }
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || Math.abs(safeMax - safeMin) < 1e-9) {
    safeMin = Number.isFinite(value) ? value - 1 : -1;
    safeMax = Number.isFinite(value) ? value + 1 : 1;
  }
  if (Number.isFinite(value)) {
    if (value < safeMin) safeMin = value;
    if (value > safeMax) safeMax = value;
  }
  if (Math.abs(safeMax - safeMin) < 1e-9) {
    safeMin -= 1;
    safeMax += 1;
  }
  return { min: safeMin, max: safeMax };
}

function clampNumber(value: number, min?: number, max?: number): number {
  const lower = min ?? -Infinity;
  const upper = max ?? Infinity;
  return Math.min(upper, Math.max(lower, value));
}

export function List({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return <ul className="plain-list">{values.map((value) => <li key={value}>{value}</li>)}</ul>;
}

// Small "ⓘ" affordance carrying an explanatory tooltip (native title). Used to surface otherwise-
// invisible mechanism detail (e.g. the two-part gate/intensive math) without a redesign.
export function InfoDot({ tip, label = "more info" }: { tip: string; label?: string }) {
  return <span className="info-dot" role="img" aria-label={label} title={tip}>ⓘ</span>;
}
