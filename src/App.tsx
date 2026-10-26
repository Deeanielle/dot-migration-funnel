import { DotFunnelScrollAnimation } from "./components/DotFunnelScrollAnimation";

export default function App() {
  return (
    <main className="page">
      <header className="intro">
        <p className="eyebrow">Prototype</p>
        <h1>Dot Migration Funnel</h1>
        <p className="lede">
          Scroll to pin the chart. Within each color, empty grey cells fill
          left to right. A row must have all 10 circles of that color before
          the row above starts. Some beats slosh backward before settling.
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
    </main>
  );
}
