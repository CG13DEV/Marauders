# RB-5.3 — Intra-room living behaviour

**[GAME]** The four-person Gryffindor ECS micro-world now exposes simple **world-time local activities** instead of four permanently stationary avatars. This is a bounded experimental spatial subsystem, not full-school 3D locomotion.

## The cause-and-effect chain

The existing ECS scheduler still owns room changes and social decisions. The new independent, deterministic room-activity domain (`simulation/src/core/room-activities.js`) owns local movement, activity goals and coordinates in the common room. It consumes the same common-room furniture/affordance plan as the Three.js stage, character interests and the authoritative world clock. The client does **not** choose NPC goals.

Each resident chooses among available interactions:
- reading at a desk or accessible bookcase;
- observing the grounds from a window seat;
- resting by a sofa or fireplace.

Options are derived from each NPC's general interest, distance to a free interaction spot and previous activity, with deterministic variation instead of RNG or character-specific scripts. Different NPCs need not constantly wander: they spend finite world-time intervals actually doing their chosen activity. Bookcases and desks are architectural obstacles; the domain selects collision-free approach points and uses an A* lattice with walkability checks. The result is a micro-space state `{actor,x,z,facing,mode,activity,destination}`.

`client/src/living-room.js` advances this spatial authority only on world-second intervals split at real RB-3 arrival and school decision boundaries. The Three.js client samples positions and shows walk cycles / activity labels. Repeated reads, changes to render FPS and polling cadence **cannot** advance an NPC's location or change its choice. The existing authoritative room-occupancy observer remains the gate for creation/removal of physical avatars. When an actor is travelling to another room, the RB-5.2 timed bridge retains priority.

## Local time bug corrected

The original client added **480 minutes** to `world.worldSeconds()`, displaying 19:10 when the actual school scheduler was at 11:10. Clock display now reads the scheduler's real world seconds; the demo starts after 115 school ticks at the real 19:10 leisure period. No artificial time-of-day adjustment is applied.

## What remains deliberately unfinished

- This is **not** ECS-integrated floor-coordinate physics for the 634-person school. The four-person demonstration has a deterministic world-side local domain alongside its ECS kernel.
- Locations are navigated around static furniture. There is no physical collision avoidance among NPCs or players, vertical floor transitions, sitting skeleton poses, or Unreal Engine integration.
- Reading, looking out of a window and resting are simulated room-activity state. They do not yet grant learned spells, record a memory, or consume a physical item. Claiming meaningful study progression requires a future command/event contract.
- Same-room `chat` in the existing ECS does not yet require sub-room conversational proximity. **Do not claim** that NPCs physically approach each other before existing social events.
- It still cannot save mid-action under checkpoint V2. Further work should integrate spatial activity with ECS snapshot and interruption priorities.
- The visual labels are diagnostic affordances, not dialogue or player knowledge of NPC private intentions.

## Verification

`client/tests/room-activities.test.mjs` exercises genuine world-time walking, obstacles, deterministic cadence, occupancy gating and monotonicity. `client/tests/living-room.test.mjs` checks corrected 19:10, local movement with no school decision, activity visibility and consistency across polling rates. Chromium `client/tests/browser-smoke.mjs` checks actual on-screen walking and HUD alongside Tower architecture regression. Merge only after full client pipeline and Simulation Lab (new `simulation/src/core` file triggers both) succeed.
