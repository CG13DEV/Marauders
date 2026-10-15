# A walkable Grand Staircase: authentic rooms 3 ⇄ 4 [GAME / FILM]

## Intent

The moving stairs must be **physical and useful**, not a movie prop or an animated
button. The user can move their controlled Marauder onto a flight, move along
its actual steps, rise/fall in 3D with it, be carried by a turn, and only step
off where the flight reaches a real floor. The Third-Floor and Fourth-Floor
west landings and their galleries come directly from the **existing** full
school ECS topology: `west_landing_3`, `gallery_3`, `west_landing_4`,
`gallery_4`. No extra room IDs are fabricated.

## Spatial contract

The relative atrium contains two REAL walkable heights:

- `west_landing_3`: y = 0. The floor opens onto `gallery_3` through a
  separate physically approached gallery portal.
- `west_landing_4`: y = 4.5. An L-shaped elevated west balcony reaches the
  upper end of the moving flight. The Fat Lady is embedded on that **elevated**
  level; a separate nearby entrance connects `gallery_4`.
- The Gryffindor **vestibule remains part of the `dorm_gryffindor` ECS
  node**. The portrait alone crosses from `west_landing_4` to Gryffindor.
- The lower base of the moving flight is `(-5.65, -0.80, y=0)` and its upper
  end when aligned is `(-5.65, 3.70, y=4.5)`. Its shared `stairPoint(t,s)`
  contact geometry uses the exact same pivot angle and world seconds as its
  Three.js render group. `t` goes from 0 (lower) to 1 (upper).

Upper walkability is a slim L-shaped balcony, **not** the entire x/z square
with an invented invisible floor. The tower's near-wall masonry, distant
portraits and some decorative upper balconies cut away for camera yaw, and
the obsolete bulky transverse scenic stairways were removed.

### Controls and time

- Approach the top or bottom flight endpoint using ordinary WASD, then
  press **F** to step onto it. Walk **along the flight with WASD**. Holding
  the movement axis raises or lowers avatar Y continuously; no teleport
  occurs when starting or while halfway up.
- Every step is checked by the player-space local collision/contact rules.
  Sideways motion is rejected at the balustrade. The avatar stays on the
  pivot if the flight turns; its x/z changes with the same world seconds
  that rotate the mesh, even without movement input.
- The bottom is attached to lower floor ground throughout a turn. The top
  is only a valid exit while aligned with the upper balcony. Otherwise a
  rider may wait at the end while the world advances. The player may step
  off onto the same floor without a room change. **Only crossing to another
  floor** issues the authentic core ECS `move` command.
- Gallery entrances are separate doors on their matching floor. Walking
  the stair does NOT unlock a remote gallery or a full map. A nearby
  `survey_gallery` establishes knowledge before a legal `move`.

### Limits / provenance

- **CANON:** the books place the entrance to Gryffindor Tower on the seventh
  floor. The portrait being above the lowest tower floor is consistent
  with this. However, our full-school simulation currently attaches the
  Gryffindor entrance to **model floor 4**. Do not claim the provisional
  world has already migrated to canonical level seven. This is a separate
  graph migration affecting routines and the whole school, not just a
  cosmetic client label.
- **FILM:** giant painted, moving-stair tower and Fat Lady on an upper landing
  are film-guided reconstruction, not book-accurate guaranteed stair geometry.
- **GAME:** this is an opt-in four-NPC client-local physical traversal
  adapter. Upper floors beyond these two levels are decorative and must
  not expose false interactable portals. Current prototype uses piecewise
  tread height from stair progress rather than continuous full rigid-body
  collision, and in-gallery room scenes use their own local ground origin.
  It does **not** imply the 634-person school has continuous 3D locomotion.
- The stair's pivot angle and actor location are derived from the same
  authoritative world clock; rendering updates do not progress world time.

## Test gate

`client/tests/grand-staircase.test.mjs` must prove the actor stays on the
correct ECS floor midway along the steps, elevation changes, true ECS
crossing occurs at the connected end, a passenger rotates with the flight,
both galleries remain reachable and a disconnected upper end stays blocked.
`client/tests/browser-smoke.mjs` traverses the actual Three.js scene into
the lower landing and `gallery_3`; screenshots and build-time graph
validation protect against mismatched surfaces and fake graph nodes.

No merge before both Node and real Chromium/SwiftShader green.
