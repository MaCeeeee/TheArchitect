// ADR-0005 AC-6 guardrail: ViewModeCamera keeps its fly-to target in
// module-level state, so two live architecture canvases would fight over the
// camera. "Parallel v2 shell" means route-level parallelism — v2 OR classic,
// never both mounted at once. This counter makes a violation impossible to miss.
let liveCount = 0;

export function acquireSceneSlot(): () => void {
  liveCount++;
  if (liveCount > 1) {
    console.error(
      `[ADR-0005 AC-6] ${liveCount} architecture canvases are mounted simultaneously. ` +
      'The ViewModeCamera fly-to singleton will misbehave. Mount the v2 JourneyShell ' +
      'OR the classic ProjectView — never both.',
    );
  }
  let released = false;
  return () => {
    if (!released) {
      released = true;
      liveCount--;
    }
  };
}

/** Test-only introspection. */
export function __liveSceneCount(): number {
  return liveCount;
}
