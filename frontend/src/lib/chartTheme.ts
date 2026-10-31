// Chart colours for the dark plum theme. SVG attributes can't read CSS variables, so they live here.
// Series pair validated (lightness band, chroma, colour-blind separation, 3:1 contrast) against the
// card surface #2a1045: worst colour-blind ΔE 15.5, normal-vision ΔE 30.4. Re-validate before adding a third.
export const CHART = {
  /** Series 1 — single-series charts always use this. */
  series1: "#ee3b8e",
  /** Series 2 — only with series 1, never alone. */
  series2: "#3a8ee8",
  grid: "#4a1f6b",
  axisText: "#b9a3cf",
  cursor: "rgba(255,255,255,0.05)",
};

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" });

/** "2026-08" → "Aug 26" */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00`));
}
