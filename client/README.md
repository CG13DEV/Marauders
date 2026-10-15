# Marauders · Gryffindor Tower prototype [GAME]

Static, serverless 2.5D Three.js cutaway prototype. **Since RB-4/5.3 a
separate four-person ECS micro-world runs live in the browser**. NPCs choose
daily actions, make validated timed room transitions and perform deterministic
local furniture activities on world time. The player avatar is STILL local
Three.js presentation, not a controlled ECS actor; see
[Player in the World](../docs/game-design/architecture-to-playable-slice.md).

### Run locally

Node >=22.16:

    cd simulation && npm install
    cd ../client && npm install
    npm run dev

Open the local Vite URL. Build/test:

    npm test
    npm run build
    npm run preview

IMPORTANT: `npm run graph` starts the real, independent
`createSchoolWeek(..., 'research-600', 'foundations-27', 'unified-30')`
at **build time** and emits `src/tower-graph.generated.json`.
It is gitignored and never hand-edited. The browser bundles the graph JSON,
Three.js, and an **independent local instance of the same ECS core** for only
four experimental NPCs. The build-time 634-resident school does NOT run in the
browser. No remote authoritative server exists yet.

### Controls

- **Desktop:** WASD / arrow keys move relative to camera; Q/E or dragging rotates;
  scroll / +/- UI zooms; F interacts near a visible staircase or door.
- **Mobile / Telegram Mini App:** tap on floor to walk, drag to rotate, camera
  controls bottom right; click stairs in common room to select a real bedroom.
- **Navigation panel:** shows all 7 years, separated into boys/girls groups,
  and two historical placeholder rooms. From a bedroom only the **common room**
  is adjacent. Other-room teleport through the UI is disallowed.
- **Render:** 8 independent pixel-art canvas frames are selected from facing
  direction relative to camera, NOT a single sprite rotated 8 ways.

### Architectural shell 0.3 and animated sprite system

Room shells declare `slotsFor('common'|'bedroom'|'landing')`:
* a wall opening **removes the corresponding full-height masonry segments**;
* each opening is mounted at `(sin(angle) * radius, cos(angle) * radius)`;
* the mount's tangent rotation is `angle + π/2`, shared by doorway,
  window embrasure, hearth, portrait and stone wall;
* the two bedroom stairwells are rendered as separate vestibules **outside**
  the common room wall. The portrait stays **in** its wall opening;
* the camera cutaway still works without moving or duplicating ECS edges.

`sprites.js` now draws **8 camera-relative directions × 4 real walking
poses = 32 frames per character style**, rather than eight fixed images with
vertical bobbing. This was originally a decorative sprite test, but the four currently visible
characters now have ECS identity and a separate local spatial activity model
(RB-5.3). They are **not** the final first-year or four-playable-Marauder cast.

Neither stair alcoves nor window openings create ECS rooms; graph
`39` bedrooms, connections, occupancy and authoritative room IDs do not
change. Rendering can be connected to a future spatial/room-presentation
layer without altering the existing school simulation.

### Tower 0.4 — spatial coherence

- **Dormitories:** five stable radial bed positions; only currently occupied
  positions render canopy beds, with foot-of-bed trunks, two genuinely embedded
  windows, window seats and a study nook. Central corridor is open.
- **Portrait landing:** `west_landing_4` is now a narrow, **rectangular**
  stair-connected corridor with the portrait in the far end wall, not a
  second circular room. Client movement respects rectangular bounds.
- **Common room:** cozy reading/study islands, tangent-facing bookcases,
  window seats, warm candles and clear approach routes to each real portal.
- **Verification:** pure spatial invariants for **all 39 bedroom nodes** and
  real Chromium/SwiftShader screenshots of three room types in
  `tower-04-spatial-coherence-screenshots`.

See [Tower 0.4 technical audit](../docs/technical/tower-04-spatial-coherence.md).
**All visual niches retain the old simulation edges.** The wall and geometry
do not secretly create additional ECS destinations.

### Graph source, not an invented dorm count

Build-time scene is exactly the simulation's 600-pupil research school.
Gryffindor: 150 assigned pupils, **37 physically distinct research bedrooms**
and **2 legacy fixture bedrooms** (39 graph nodes), all directly adjacent to
`dorm_gryffindor`; its sole upstream connection is `west_landing_4`.
Each research room has an observed count from actual world occupancy (1–5).

Seven years and two staircases are lore; splitting some year/sex cohorts into
multiple bedrooms is **[GAME]**, not canon. Visual stair selection is a grouping
interface over the current star-shaped graph: it must not silently introduce
corridor nodes. The source simulation labels Gryffindor common room floor=4 as
a topology convenience while book references say seventh-floor entrance.

### Publishing

`.github/workflows/gryffindor-pages.yml` checks the graph, builds the client
and on pushes to `main` attempts GitHub Pages deployment to:

    https://cg13dev.github.io/Marauders/

For the private organization repository, GitHub Pages availability **depends
on the organization's plan and Pages settings**. An admin must select
**Settings → Pages → Build and deployment → GitHub Actions**. The workflow
cannot override the owner's subscription or Pages configuration. A private
repository can still produce a publicly visible Pages website. The public artifact contains client code, the bundled four-actor ECS micro-world and graph-derived room metadata; it contains no school checkpoint or private resident history.

Do not publish any proprietary source files, third-party images or private
credentials through Pages. The tiny 3D geometry and all 8 sprites are original
procedural placeholders; the setting itself is fan-IP and should be reviewed
under `docs/production/ip-and-asset-policy.md` before external announcement.

### Limits

The four-NPC micro-world runs locally in the browser and is **not connected
to the 634-person school runtime** or durable persistence. RB-5.3 provides
seconds-based movement around static furniture but not complete authoritative
ECS floor-coordinate physics, mutual collision or player interaction.
Simple local circular collision and direct walk-to-point are client-only
prototyping physics and must not be mistaken for authoritative simulation
or multi-room character pathfinding.

## RB-5.2 · Authoritative seconds

The four experimental NPCs now use the opt-in RB-5.1 world-clock travel path. Their walking sprite samples ECS/bridge progress rather than replaying arrival events after a fixed delay. See [RB-5.2](../docs/technical/experiment-rb-5-2-visual-observer.md). The browser micro-world still does not simulate collision-safe continuous floor position or in-progress persistent saves.

## From viewer to game

See the [architecture-to-first-playable-slice proposal](../docs/game-design/architecture-to-playable-slice.md). Immediate priority is a real player-controlled Marauder ECS identity, validated player actions and perception-scoped UI; scaling the viewer to 634 drawn NPCs is not a substitute for playable interaction.
