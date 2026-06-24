import { createRoot } from "react-dom/client";
import "../styles.css";
import "../styles/gallery.css";
import "../outputs/prototype/output-boxes.css";
import { Gallery } from "./Gallery";

createRoot(document.getElementById("gallery-root") as HTMLElement).render(<Gallery />);
