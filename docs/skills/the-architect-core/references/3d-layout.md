# The Architect — 3D layout (so the model is readable, not a hairball)

A committed model with no layout discipline renders as a sprawling star-field of
crossing edges that reads as broken — regardless of content quality. This file is
the recipe for a clean layout. Read it before committing.

## How the scene positions elements (the two facts that matter)

1. **Y is auto-resolved by layer + type — don't fight it.** On load, the client
   store (`architectureStore.alignYToLayer`) overwrites every element's Y using
   `resolveElementY(layer, type)`. So whatever Y you send is replaced. **You only
   control X and Z.** (Set Y to the resolved value anyway so the stored data is
   clean for other consumers — values below.)

2. **The scene is in small units (~3 per cell).** Layout helpers use `x = col*3`,
   `z = row*3`. Keep X/Z in **single/low-double digits**. The original failure
   was sending X from −320…+330 (≈100× too large) → the star-field. Stay roughly
   within −12…+12.

## The Y bands (from `resolveElementY`)

Layer planes (flat layers sit on these): motivation 16, **strategy 12**, business
8, data 4, application 0, technology −4, physical −8, impl/migration −12.

**Motivation** sub-stacks by type (floats above its plane, connected downward):
```
stakeholder 31 · driver 28.5 · assessment/meaning 26 · goal 23.5 ·
outcome/am_value 21 · principle 18.5 · requirement/constraint 16
```
**Strategy** sub-stacks too (Value Stream View — floats above the strategy plane):
```
value_stream 14.5 · business_capability/resource 13
```
All other layers are flat at their plane Y (so a box at exactly the plane Y is
bisected by the plane — that's why motivation/strategy *float* above it).

## Layout recipe

**Motivation = a vertical wall at `z = 0`.** Y stacks automatically by type;
spread elements horizontally with X. Example for a typical vision:
- stakeholders: `z=0`, X across e.g. −10,−6,−2,2,6,10
- drivers: `z=0`, X e.g. −6,0,6
- goal: `z=0`, X 0
- outcomes: `z=0`, X −6,0,6
- principle: `z=0`, X off to a side (e.g. −10) so it doesn't stack under the goal

**Strategy = the Value Stream View.** Value streams float (y 14.5) above
capabilities (y 13); put capabilities directly below in Z rows, serving up:
- value streams: `y=14.5, z=0`, X −5, 5
- capabilities (have): `y=13, z=4`, X −9,−3,3,9
- capabilities (gap): `y=13, z=9`, X −9,−3,3,9
- wire `capability —serving→ value_stream` (arrow points up) → canonical Value
  Stream View.

## Why this works

Motivation becomes a readable vertical chain (stakeholder→…→requirement) on one
plane; strategy becomes a floor below it where value streams hover over the
capabilities that serve them. Edges run mostly short and downward/upward instead
of crossing the whole scene. Switching the canvas to **2D** is also far more
legible for a pure motivation model — suggest it to the user.

## If the layout still looks off

Re-run only the position updates (`PUT …/elements/:id` with `position3D`) — the
reference script supports a layout-only pass. Adjust X/Z spacing (keep it small),
never Y (it's auto-resolved). Don't recreate the project to fix layout.

## Note for maintainers

The strategy sub-stack (`STRATEGY_SUB_Y`) was added in
`packages/shared/src/constants/togaf.constants.ts` so value streams float above
capabilities — this is what makes the Value Stream View work. If a future model
uses other strategy types that should float, extend `STRATEGY_SUB_Y` there.
