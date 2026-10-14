# RB-5.2 — Visualizing authoritative NPC travel

**[GAME]** Wires RB-5.1's opt-in autonomous scheduled travel into the four-actor browser ECS micro-world (RB-4) and renders **current RB-3 progress** instead of animating completed movement after the fact.

## What actually moves

Four experimental Gryffindor avatars keep their existing DailyLife, goals and social rules. After the initial 67-tick warm-up, the room world opts each actor into `setAutonomousTimedTravel`. The scheduler still decides *whether and where* they move. Room movement is accepted but not instantly committed. `TimedWorldBridge` advances the same monotonic world-seconds clock: an actor remains assigned to their last committed room until the edge duration elapses and a validated `entity_moved` is emitted.

`client/src/living-room.js` offers `advanceSeconds(n)` as a world-clock driver. It advances the RB-3 timeline to each next 600-second school decision boundary, calls `world.step()` there and continues progressing between boundaries. `advance()` remains a deterministic one-school-tick compatibility convenience. Browser snapshots expose only public room occupancy, event log and non-secret active-leg progress; they never reveal NPC beliefs, personal journals or private intent stores.

The Three.js frontend uses a separate `setInterval` clock and integer-time accumulator, at **30 game seconds per real second** (20 real seconds per ten-minute decision step). The renderer only samples the resulting `journeys.progress`. Every departure interpolates from the actor's last client appearance toward the actual architectural opening; at a real ECS arrival the sprite is immediately removed from the origin and instantiated at the destination portal. The old 2.9-second **post-hoc** departure/arrival animation was removed.

Event-order reconstruction tracks physical positions while iterating world events. Social interactions are only listed when the participants were in the common room **at that event's occurrence**, not based on where they were at the end of a large catch-up interval. These published messages are still diagnostic, not the player's complete sensory perception.

## Bounds — what this does NOT implement

- This is a **four-person local ECS micro-world**, not the 634-person school connected to the browser.
- World ECS location remains a room-level state until validated arrival. Within-room character coordinates are presentation-only interpolation toward a portal, not collision-safe navmesh or authoritative floor physics. No full-body animations.
- An NPC in transit is withheld from further autonomous scheduler actions. There is no general reactive interruption policy or full physical collision/meeting treatment yet.
- RuntimeSnapshot V2 still refuses in-flight/partial-time saves; mid-action persistent checkpoints require a new schema.
- The browser clock rate is experimental and not a canonical relation of Hogwarts minutes to wall time. Rendering FPS never affects NPC decisions.

## Verification

`client/tests/living-room.test.mjs` verifies sub-tick progress, no early `entity_moved`, exact arrival timestamp, polling-cadence independence and existing RB-4 tests. `client/tests/browser-smoke.mjs` checks the running WebGL client and seconds-level observation plus the Tower 0.4 architecture. CI is `Gryffindor Tower Client and Pages`.

Future RB-5.3: deliberate interrupt/replan and in-transit contact semantics. No further merge until these regression gates succeed.
