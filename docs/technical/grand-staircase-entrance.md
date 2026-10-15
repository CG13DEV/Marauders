# The Fat Lady, vestibule and Grand Staircase [CANON / FILM / GAME]

## Sources and variant choice

- **CANON (books/official reference):** Gryffindor common room is in Gryffindor Tower, and its entrance is protected by the Fat Lady's password-controlled portrait. The dormitory stairs lead away from the circular common room. Reference: https://www.harrypotter.com/fact-file/locations/the-gryffindor-common-room
- **FILM:** from *Prisoner of Azkaban*, the Fat Lady's portrait is on the Grand Staircase landing, with high painted walls and rearranging stairs. Earlier film and novel corridors differ. Do **not** assert that the moving staircase or a particular portrait-wall configuration is specified by the novels.
- **GAME:** preserve the current provisional ECS `west_landing_4` / `gallery_4` keys while presenting a film-inspired Grand Staircase Tower. The number `4` in those prototype IDs is **not** a canon claim that the Gryffindor entrance lies on the fourth floor. Renumbering the full castle topology belongs to its own auditable migration.

The user's supplied film stills guide staircase density, portraits, railings, and the Fat Lady's placement; geometry and colors are an original low-poly reconstruction, not film assets.

## Exact playable path

```
[common-room ECS key dorm_gryffindor]
  circular common area
     ↕ walk through the actual arch in the same loaded scene
  narrow Gryffindor vestibule (same room key, no extra ECS room)
     ↕ portrait / validated ECS transition
[west_landing_4 — Grand Staircase atrium, many paintings]
     ↕ one clock-driven rotating flight, only while aligned
[gallery_4 — existing real ECS gallery]
```

The outdoor Fat Lady facade faces the Grand Staircase. Inside, her panel is at the **far end of the physical vestibule**, rather than as freestanding furniture in the circular common room. A character returning from the staircase spawns **in the vestibule**, walks back through the inner common-room arch and then enters the circular lounge. The player has to approach the portrait to leave, not click from the room's middle.

`tower-entrance.js` owns all coordinates used by both Three.js rendering and the player-local collision / discovery adapter. The world room-to-room moves remain ECS commands; neither a portal click nor a GUI navigator can bypass physical distance or knowledge checks.

## Stair physics contract (current client slice)

`grandStairState(worldSeconds)` repeats on a 240-world-second cycle:
- seconds [0,90): aligned with the actual `gallery_4` transition;
- [90,120): visually rotates toward an upper viewing balcony;
- [120,180): looks toward the alternate balcony, which has **no fabricated ECS node**;
- [180,210): rotates back;
- [210,240): connected to `gallery_4` again.

Rotation of the actual stair tread group uses the **same state** as the
`canCross` check. When it is misaligned, the player can examine the approach
and learn about the gallery but cannot enter or leave the gallery using that
flight. Waiting or nearby activities advance the same ECS world clock;
render frames and repeated snapshots do not. No new always-open portal
circumvents the turn.

The stair geometry really rotates around its fixed ground-floor base in the
Three.js scene. This is still the existing **2.5D four-NPC playable client**:
the avatar interacts at the reachable stair base and ECS transition rather
than walking each physical riser with full 3D platform attachment. Upper
balconies and static flights are vertical architectural scenery **not
additional playable rooms**. This scope is deliberate; do not claim fully
continuous 3D climbing or rideable moving platforms.

All four playable Marauders are Gryffindors, so they know the guarded entrance;
outsiders are not simulated by this four-NPC slice. The general rule that
non-Gryffindors cannot infer a hidden Gryffindor entrance from an omniscient
map is part of the wider design, **not yet an access-control mechanic**.
Password entry and portrait animation are future work.

## Regression rules

- The player must be able to walk from the common room into the vestibule
  across the former round-wall collision boundary and vice versa.
- Room keys must not change inside the vestibule; all ECS transitions happen
  at the portrait or correctly aligned staircase.
- Collisions of stone pillars and the portrait approach must match visuals.
- Stair angles, alignment and rejection must agree at time boundaries.
- The viewing balcony orientation is not a fake teleport destination.
- An avatar returning from the gallery spawns by the rotating flight; an
  avatar returning from the portrait spawns in the vestibule.
- Both normal and developer-mode navigation must respect these prerequisites.
- Actual Chromium WebGL smoke tests and the simulation CI are mandatory.
