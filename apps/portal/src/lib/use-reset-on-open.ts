import { useState } from "react";

function depsChanged(a: unknown[], b: unknown[]) {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

// Resets form/dialog state during render, not via a useEffect, whenever
// `open` transitions to true or `deps` changes while already open — e.g.
// re-populating a dialog's form fields for the (possibly different) item
// it was opened for. See
// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
// — doing this in an effect commits stale state first and corrects it a
// render later, which is the flash a set-state-in-effect avoids.
export function useResetOnOpen(open: boolean, deps: unknown[], reset: () => void) {
  const [prev, setPrev] = useState({ open, deps });
  if (prev.open !== open || depsChanged(prev.deps, deps)) {
    setPrev({ open, deps });
    if (open) reset();
  }
}
