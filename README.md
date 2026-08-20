# EAS Fleet Calculator

**The live calculator behind [electricairshipping.com](https://www.electricairshipping.com) —
[calc.electricairshipping.com](https://calc.electricairshipping.com)**

An airship design calculator. You pick (or upload) a hull shape, size it, fly it,
build a fleet from it, and find out whether the economics work — with the tool
arguing honestly at every step about what it does and doesn't know.

Its stance is *"beat us with your own shape"*: drop in your own `.obj` and it will
measure and price it with exactly the same machinery it uses on the Sunship.

---

## Run it locally

You need [Node](https://nodejs.org) (built on v24; anything modern works).
**There are no dependencies to install — no `npm install`, nothing to build.**

```bash
node serve.mjs
```

Then open <http://localhost:5179/>. On Windows you can double-click
**`START CALCULATOR V1.bat`** instead.

That's it. The server is a ~70-line static file server whose only job is to mimic
Cloudflare Pages' SPA fallback so client-side routes like `/fleet` resolve.

### Run the tests

```bash
node test/dynamic-state-fixtures.mjs    # UI-boundary fixtures (state/display rules)
node test/economics-fixtures.mjs        # economics model
node gate-calcv2.mjs                    # the full release gate (see below)
```

---

## The five pages, and how they chain

Each page's outputs feed the next, and **never the other way** — earlier pages
never repaint when a later one changes.

```
SHAPE      geometry → convex hull → exact minimum bounding sphere → Monte-Carlo VS∞
           out: VS, VS∞, VE%
             ↓
SHIP        ├─ STATICS   size + internal temperature → NET LIFT
            └─ DYNAMICS  Cd × system credit × airspeed → drag → power → LH2 + storage
             ↓
FLEET      trip distance + utilisation + market → ships required, CO₂ displaced
             ↓
ECONOMIC   freight rate + carbon price + capex/opex → revenue, profit, breakeven
```

---

## How the code is arranged (the one thing to understand)

This repo contains a calculator whose **original bundle cannot be edited**.

`main.js` is the minified production build of the first version of this app, by its
original author; the readable source doesn't exist here. Rather than fork or reverse
it, everything new is added as **adapters**: ES modules in `v2/` that select the
existing DOM, read its outputs, and push values back through *its own* input
pathways (set `.value`, dispatch `input`) — exactly as a user's interaction would.

**`main.js` is byte-identical to the version first mirrored here, and a release gate
asserts its SHA-256 on every build.** If you're auditing one thing, audit that.

```
index.html          the page shell (V1's markup + our <script type="module"> tags)
style.css           V1's hand-authored stylesheet
main.js             V1's minified bundle — NEVER EDITED (hash-guarded)
main.js.sha256      the guard's expected hash

v2/                 the adapter layer — everything new lives here
  shape-upload.js     .obj/.glb upload + live shape measurement
  viewer3d.js         3D viewer (a parameter-for-parameter replica of V1's renderer)
  dynamic-state.js    PURE state/display module for the DYNAMICS page (engine injected)
  dynamic-page.js     DYNAMICS DOM — computes nothing itself
  ship-split.js       the STATICS ⇄ DYNAMICS split, chooser and nav semantics
  fleet-routes.js     the rotating world-routes globe
  route-data.js       generated ocean-clean city pairs (see its header for the rules)
  fleet-results-relabel.js  fleet/economic result labels + cross-page warning flags
  geometry-warnings.js      rectilinear / directionality / no-lift screens
  economics.js        pure economics model (takes net lift, returns money)
  revenue.js          economics page DOM + the COPY SUMMARY
  mobile.js           ALL phone layout + tap-to-reveal (scoped to ≤768px)
  *-config.js         the numbers a human is meant to edit (thresholds, CO₂, rates)

calcv2/             BAKED COPY of the headless engine — do not hand-edit
  src/                shape metrics, dynamics, and the drag-coefficient estimator

test/               fixtures (plain node, zero deps)
gate-calcv2.mjs     the release gate
bake-calcv2.mjs     copies the engine from the CalcV2 repo into calcv2/
```

### Where the physics actually lives

`calcv2/` is a **baked copy** of a separate headless library (the CalcV2 repo). It has
no DOM and no dependencies, so every number it produces is testable in plain Node.
It holds the shape metrics (VS/VS∞/VE), the dynamics model (drag → power → fuel), and
a low-order **sectional geometric drag-coefficient estimator** that measures a hull's
own blockage profile, classifies how it separates, and prices it against real
historical wind-tunnel data (NACA TN-614, TR-432 *Akron*, 1923 Göttingen ellipsoids).

That estimator **proposes** a Cd; the slider always **disposes**. Cd and the system
credit are declared inputs with an estimate offered, never outputs of a flow solver —
that distinction is deliberate and is enforced throughout the UI copy.

### The release gate

`node gate-calcv2.mjs` runs the checks that must pass before anything deploys:
`main.js` hash unchanged (before *and* after baking) → bake → byte-parity sweep of
the baked engine → every fixture suite against **both** the source and baked engines →
and a guard that the bake touched *only* `calcv2/` paths.

---

## Conventions you'll notice while reading

- **Comments explain *why*, and cite the ruling or measurement behind a number.**
  Constants that encode a judgement carry a five-field block: what it is, why, its
  provenance, its known limitation, and what would justify replacing it.
- **Warnings are the only status language.** Silence means pass. Nothing is coloured
  green to congratulate you.
- **Config files are meant to be edited by a human in a text editor**, not tuned in code.
- **Phone changes live only in `v2/mobile.js`**, inside `@media (max-width: 768px)`,
  so desktop/tablet layouts can't be affected by them.

## Licence

Source code is **MIT** (see `LICENSE`). Read **`NOTICE`** before assuming that
extends further: the Sunship design is patent pending (AU 2026902104, PCT under way),
no patent rights are granted here, and the 3D geometry is included for verifying the
calculator's measurements rather than for reuse.
