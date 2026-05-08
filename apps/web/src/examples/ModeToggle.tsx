import { MODE_LABELS, modeDescription } from "../shared/workbench";
import type { WorkbenchMode } from "../shared/workbench";

export function ModeToggle(props: { value: WorkbenchMode; onChange: (value: WorkbenchMode) => void }) {
  return (
    <div className="mode-toggle" aria-label="Workbench mode">
      {(Object.keys(MODE_LABELS) as WorkbenchMode[]).map((mode) => (
        <button
          type="button"
          className={props.value === mode ? "active" : ""}
          aria-pressed={props.value === mode}
          title={modeDescription(mode)}
          onClick={() => props.onChange(mode)}
          key={mode}
        >
          {MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
