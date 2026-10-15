# Marauders · Gryffindor Tower prototype [GAME]

Static, serverless 2.5D Three.js cutaway prototype with a four-NPC
browser ECS micro-world. The player controls a real ECS Marauder, sees
personally earned knowledge and can perform validated local interactions.
**This is not the full 634-character school simulation or durable save system.**

Film-style Grand Staircase is now the public 3D entrance: portrait-covered
multi-storey atrium, an actually rotating stair flight, and a small traversable
vestibule BEFORE the round common room **without another ECS graph node**.
The moving flight gates the real gallery edge in both directions. See
[architectural contract and canon-vs-film sources](../docs/technical/grand-staircase-entrance.md).

G3.3: `talk` (90 world seconds) and `ask_cup` (45 seconds) complete only
while participants remain present and can be cancelled; the newly accessible
gallery bench provides a 60-second wait. See
[time-occupied player actions](../docs/technical/g3-3-timed-actions-and-gallery-bench.md).

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
It is gitignored and never hand-edited. The browser bundles the generated
room-graph JSON, Three.js and a **separate, four-NPC local instance of the
same ECS core**. It does **not** start the authoritative 634-resident school
runtime, nor does it connect to a remote server.

### Controls

- **Desktop:** WASD / arrow keys move relative to camera; Q/E or dragging rotates;
  scroll / +/- UI zooms; F interacts near a visible staircase or door.
- **Mobile / Telegram Mini App:** tap on floor to walk, drag to rotate, camera
  controls bottom right; click stairs in common room to select a real bedroom.
- **Personal knowledge:** normal play shows only personally discovered rooms
  and observations, not a full map. The old navigation panel is available in
  `?debug=1` / `?testMode=1` but still cannot teleport through walls.
  Only real adjacent room transitions are accepted by ECS.
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
vertical bobbing. Three additional distinctly coloured students are **local
decorative sprite stand-ins**, explicitly *not NPC simulation*. For now they
exist to check scale, silhouette legibility, camera angles and visual variety.

Neither stair alcoves nor window openings create ECS rooms; graph
`39` bedrooms, connections, occupancy and authoritative room IDs do not
change. Rendering can be connected to a future spatial/room-presentation
layer without altering the existing school simulation.

### Tower 0.4 — spatial coherence

- **Dormitories:** five stable radial bed positions; only currently occupied
  positions render canopy beds, with foot-of-bed trunks, two genuinely embedded
  windows, window seats and a study nook. Central corridor is open.
- **Portrait tower (reworked after Tower 0.4):** `west_landing_4` is a
  large multilevel Grand Staircase atrium, **not** the old narrow landing.
  The Fat Lady's portrait is one of many, and the player reaches it through
  physically validated collision bounds and a dedicated common-room vestibule.
  A rotating Three.js staircase gates the existing gallery route.
- **Common room:** a real small entrance vestibule now sits between the Fat
  Lady and the circular lounge, and remains part of `dorm_gryffindor`.
  Cozy reading/study islands, tangent-facing bookcases,
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

### G3 geography and world-time interactions

Beyond the portrait landing, the authentic `gallery_4` graph room is
explorable via the discovered north stair. Its new stone bench is a small
collider-matched niche where an actual 60-world-second player waiting action
can occur. Nearby conversations also occupy world seconds (90 chat / 45
cup question), can be cancelled and do not report an answer before the world
accepts the final command. No temporary action is durable across reload.

### Publishing

`.github/workflows/gryffindor-pages.yml` checks the graph, builds the client
and on pushes to `main` attempts GitHub Pages deployment to:

    https://cg13dev.github.io/Marauders/

For the private organization repository, GitHub Pages availability **depends
on the organization's plan and Pages settings**. An admin must select
**Settings → Pages → Build and deployment → GitHub Actions**. The workflow
cannot override the owner's subscription or Pages configuration. A private
repository can still produce a publicly visible Pages website. The public
artifact only contains scene code + graph-derived room metadata.

Do not publish any proprietary source files, third-party images or private
credentials through Pages. The tiny 3D geometry and all 8 sprites are original
procedural placeholders; the setting itself is fan-IP and should be reviewed
under `docs/production/ip-and-asset-policy.md` before external announcement.

### Limits

The four-NPC micro-world now runs locally in the browser, but is **not connected
to the 634-person school runtime** or durable persistence; no physical per-second
NPC world.
Simple local circular collision and direct walk-to-point are client-only
prototyping physics and must not be mistaken for authoritative simulation
or multi-room character pathfinding.

## RB-5.2 · Authoritative seconds

The four experimental NPCs now use the opt-in RB-5.1 world-clock travel path. Their walking sprite samples ECS/bridge progress rather than replaying arrival events after a fixed delay. See [RB-5.2](../docs/technical/experiment-rb-5-2-visual-observer.md). The browser micro-world still does not simulate collision-safe continuous floor position or in-progress persistent saves.
