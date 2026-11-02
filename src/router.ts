// Hand-off between tabs, e.g. "Review this game" from Play into Analysis.
import type { AnalysisInput } from "./analysis";

let pending: AnalysisInput | undefined;

export function openInAnalysis(input: AnalysisInput) {
  pending = input;
  if (location.hash === "#analysis") window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = "#analysis";
}

export function takePending() {
  const p = pending;
  pending = undefined;
  return p;
}
