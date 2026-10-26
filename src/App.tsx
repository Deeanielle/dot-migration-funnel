import { useEffect, useState, type ReactNode } from "react";
import { DotFunnelScrollAnimation } from "./components/DotFunnelScrollAnimation";
import { FloatingClusterFunnel } from "./components/FloatingClusterFunnel";
import { BubbleClusterFunnel } from "./components/BubbleClusterFunnel";
import { StaircaseFunnel } from "./components/StaircaseFunnel";
import { TubesFunnel } from "./components/TubesFunnel";
import { TrailsFunnel } from "./components/TrailsFunnel";

type Version = {
  id: string;
  hash: string;
  tab: string;
  eyebrow: string;
  title: string;
  lede: string;
  chart: () => ReactNode;
  footer: ReactNode;
};

const SAME_DATA = (
  <p>
    Same data as the grid version: 10 steps, about 100 dots.
    <br />
    Progress is not always forward.
  </p>
);

const VERSIONS: Version[] = [
  {
    id: "grid",
    hash: "#grid",
    tab: "Grid",
    eyebrow: "Prototype",
    title: "Dot Migration Funnel",
    lede: "Scroll to pin the chart. Within each color, empty grey cells fill left to right. A row must have all 10 circles of that color before the row above starts. Some beats slosh backward before settling.",
    chart: () => <DotFunnelScrollAnimation scrollHeightVh={720} />,
    footer: (
      <p>
        Start: 2 orange · 27 navy · 53 light blue · 18 blue · 0 green.
        <br />
        End: 1 orange · 15 navy · 44 light blue · 33 blue · 8 green.
        <br />
        Middle beats occasionally slosh backward before settling forward.
      </p>
    ),
  },
  {
    id: "floating",
    hash: "#floating",
    tab: "Columns",
    eyebrow: "Prototype · Version 2",
    title: "Floating Columns",
    lede: "Each column is a stage. Scroll to step through time: dots float off one column and ease into the next, changing colour as they cross. Column gradients deepen as they fill.",
    chart: () => <FloatingClusterFunnel stepVh={70} />,
    footer: SAME_DATA,
  },
  {
    id: "bubbles",
    hash: "#bubbles",
    tab: "Bubbles",
    eyebrow: "Prototype · Version 3",
    title: "Bubbles",
    lede: "Each colored bubble is a stage, with its count underneath. Scroll to step through time: dots float off one bubble and ease into the next. Forward moves arc over the top, and dots that slip back a step arc underneath.",
    chart: () => <BubbleClusterFunnel stepVh={70} />,
    footer: SAME_DATA,
  },
  {
    id: "staircase",
    hash: "#staircase",
    tab: "Staircase",
    eyebrow: "Prototype · Version 4",
    title: "Staircase",
    lede: "Each step is a stage. Scroll to step through time: dots hop up to the next step and land with a little bounce. Dots that go back slide off the edge and drop down a step.",
    chart: () => <StaircaseFunnel stepVh={70} />,
    footer: SAME_DATA,
  },
  {
    id: "tubes",
    hash: "#tubes",
    tab: "Tubes",
    eyebrow: "Prototype · Version 5",
    title: "Tubes",
    lede: "Each tube is a stage, and the stacks read like a bar chart. Scroll to step through time: dots rise out, float over and drop into the next tube. Dots going back skim low over the wall.",
    chart: () => <TubesFunnel stepVh={70} />,
    footer: SAME_DATA,
  },
  {
    id: "trails",
    hash: "#trails",
    tab: "Trails",
    eyebrow: "Prototype · Version 6",
    title: "Trails",
    lede: "The column layout with a fading tail behind every moving dot. Each tail is faintest at its oldest end and strongest right behind the dot, then fades away once the dot lands.",
    chart: () => <TrailsFunnel stepVh={70} />,
    footer: SAME_DATA,
  },
];

const versionFromHash = () =>
  VERSIONS.find((v) => v.hash === window.location.hash) ?? VERSIONS[0];

export default function App() {
  const [version, setVersion] = useState(versionFromHash);

  useEffect(() => {
    const onHash = () => {
      setVersion(versionFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <main className="page">
      <nav className="version-nav" aria-label="Prototype versions">
        {VERSIONS.map((v) => (
          <a
            key={v.id}
            href={v.hash}
            aria-current={v.id === version.id ? "page" : undefined}
          >
            {v.tab}
          </a>
        ))}
      </nav>

      <div key={version.id}>
        <header className="intro">
          <p className="eyebrow">{version.eyebrow}</p>
          <h1>{version.title}</h1>
          <p className="lede">{version.lede}</p>
        </header>

        {version.chart()}

        <footer className="outro">{version.footer}</footer>
      </div>
    </main>
  );
}
