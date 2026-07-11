import { createRoot } from "react-dom/client";
import "../styles.css";
import "../styles/uilab.css";
import { UiLab } from "./UiLab";

createRoot(document.getElementById("uilab-root") as HTMLElement).render(<UiLab />);
