import { useEffect, useState } from "react";

interface Rect { top: number; left: number; width: number; height: number }

// Dims the page and rings the target control. The ring div carries a giant box-shadow (the dim) and an
// inset border (the ring); pointer-events:none means clicks pass straight through to the real control,
// so the user still drives the app — the spotlight only draws attention.
export function TutorialSpotlight(props: { target?: string }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!props.target) { setRect(null); return; }
    let raf = 0;
    const measure = () => {
      const el = props.target ? document.querySelector(props.target) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
      raf = window.setTimeout(measure, 200); // targets move (fitView, resize) — keep the ring on it
    };
    measure();
    return () => window.clearTimeout(raf);
  }, [props.target]);

  if (!rect) return null;
  const pad = 6;
  return (
    <div
      className="tutorial-spotlight"
      style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
    />
  );
}
