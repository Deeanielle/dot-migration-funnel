import { useEffect, useState } from "react";
import { DotFunnelScrollAnimation } from "./components/DotFunnelScrollAnimation";
import { FloatingClusterFunnel } from "./components/FloatingClusterFunnel";
import { BubbleClusterFunnel } from "./components/BubbleClusterFunnel";

type View = "grid" | "floating" | "bubbles";
const viewFromHash = (): View =>
  window.location.hash === "#floating"
    ? "floating"
    : window.location.hash === "#bubbles"
      ? "bubbles"
      : "grid";

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <main className="page">
      <nav className="version-nav" aria-label="Prototype versions">
        <a href="#grid" aria-current={view === "grid" ? "page" : undefined}>
          Grid
        </a>
        <a
          href="#floating"
          aria-current={view === "floating" ? "page" : undefined}
        >
          Columns
        </a>
        <a
          href="#bubbles"
          aria-current={view === "bubbles" ? "page" : undefined}
        >
          Bubbles
        </a>
      </nav>

      {view === "grid" ? (
        <div key="grid">
          <header className="intro">
            <p className="eyebrow">Prototype</p>
            <h1>Dot Migration Funnel</h1>
            <p className="lede">
              Scroll to pin the chart. Within each color, empty grey cells fill
              left to right. A row must have all 10 circles of that color
              before the row above starts. Some beats slosh backward before
              settling.
            </p>
          </header>

          <DotFunnelScrollAnimation scrollHeightVh={720} />

          <footer className="outro">
            <p>
              Start: 2 orange · 27 navy · 53 light blue · 18 blue · 0 green.
              <br />
              End: 1 orange · 15 navy · 44 light blue · 33 blue · 8 green.
              <br />
              Middle beats occasionally slosh backward before settling forward.
            </p>
          </footer>
        </div>
      ) : view === "floating" ? (
        <div key="floating">
          <header className="intro">
            <p className="eyebrow">Prototype · Version 2</p>
            <h1>Floating Columns</h1>
            <p className="lede">
              Each colored cluster is a stage. Scroll to step through time:
              dots float off one cluster and ease into the next. Forward moves
              arc over the top, and dots that slip back a step arc underneath.
            </p>
          </header>

          <FloatingClusterFunnel stepVh={70} />

          <footer className="outro">
            <p>
              Same data as the grid version: 10 steps, about 100 dots.
              <br />
              Progress is not always forward.
            </p>
          </footer>
        </div>
      ) : (
        <div key="bubbles">
          <header className="intro">
            <p className="eyebrow">Prototype · Version 3</p>
            <h1>Bubbles</h1>
            <p className="lede">
              Each colored bubble is a stage, with its count underneath. Scroll
              to step through time: dots float off one bubble and ease into the
              next. Forward moves arc over the top, and dots that slip back a
              step arc underneath.
            </p>
          </header>

          <BubbleClusterFunnel stepVh={70} />

          <footer className="outro">
            <p>
              Same data as the grid version: 10 steps, about 100 dots.
              <br />
              Progress is not always forward.
            </p>
          </footer>
        </div>
      )}
    </main>
  );
}
