# A pure engine between the API and the UI

All knowledge of Zerion's response shapes and of the story's rules lives in `src/engine/`: pure functions (`createState` → `accumulate(page)` → `finalize` → `RewindFacts`) with no I/O, no React and no clock. Components read only `RewindFacts`, the contract defined with the design handoff (`design/types.ts`).

## Considered options

- **Map inside components or hooks.** Rejected: API shapes leak into the UI, the rules become untestable without rendering, and the design playground can't run on fixtures.
- **Map on the server and return `RewindFacts`.** Rejected for v1: the reveal needs per-page progress on the client ([ADR-0002](0002-loading-is-the-animation.md)). Because the engine is pure, it can move server-side later without changes.
- **A generic analytics library.** Rejected: the aggregation is small and specific (shares that total 100, real high and low points), and it's clearer as ~200 tested lines.

## Consequences

- The engine is test-first. Its rules are written as concrete input/output examples in `.claude/rules/rewind-engine.md`, and tests run on recorded fixtures.
- The UI and the data layer could be built in parallel against the same contract. `/system` runs the full story on fixtures with no API.
- `now` is injected, so results are deterministic in tests.
- The same `RewindFacts` could later feed other surfaces (a server-rendered share preview, an agent skill) without touching the UI.
