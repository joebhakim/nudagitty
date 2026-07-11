import { createRoot } from "react-dom/client";
import { EffectsExplainer } from "./EffectsExplainer";
import "./effects.css";

createRoot(document.getElementById("effects-root") as HTMLElement).render(<EffectsExplainer />);
