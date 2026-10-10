# Marauders · Gryffindor Tower prototype [GAME]

Static, serverless 2.5D Three.js cutaway prototype. **No live NPC simulation yet**:
it visualizes a graph-derived set of rooms and tests camera, room geometry,
eight camera-relative sprite orientations, pointer/WASD movement and transitions.

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
It is gitignored, never hand-edited. The browser bundles only the resulting
plain JSON, Three.js and our home-grown scene/sprites. It does not bundle the
authoritative ECS simulation or create a remote server.

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
repository can still produce a publicly visible Pages website. The public
artifact only contains scene code + graph-derived room metadata.

Do not publish any proprietary source files, third-party images or private
credentials through Pages. The tiny 3D geometry and all 8 sprites are original
procedural placeholders; the setting itself is fan-IP and should be reviewed
under `docs/production/ip-and-asset-policy.md` before external announcement.

### Limits

Not connected to runtime NPCs or persistence; no physical per-second world.
Simple local circular collision and direct walk-to-point are client-only
prototyping physics and must not be mistaken for authoritative simulation
or multi-room character pathfinding.
