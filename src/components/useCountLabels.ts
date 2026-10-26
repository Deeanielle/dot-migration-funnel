import { useCallback, useRef } from "react";

/** Keeps a row of SVG <text> count labels in sync with live counts without re-rendering React. */
export function useCountLabels() {
  const refs = useRef<(SVGTextElement | null)[]>([]);
  const shown = useRef<number[]>([]);
  const onTick = useCallback((live: number[]) => {
    live.forEach((n, z) => {
      const el = refs.current[z];
      if (el && shown.current[z] !== n) {
        shown.current[z] = n;
        el.textContent = String(n);
      }
    });
  }, []);
  const setRef = (z: number) => (el: SVGTextElement | null) => {
    refs.current[z] = el;
    shown.current[z] = -1;
  };
  return { onTick, setRef };
}
