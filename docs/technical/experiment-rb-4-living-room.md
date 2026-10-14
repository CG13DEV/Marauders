# RB-4 — Living Room

**[GAME]** Browser-based autonomous Gryffindor micro-world. The Three.js tower displays occupants and events from a real local ECS `createSimulation()` instance. This is a **four-character demonstration**, not a rendered 634-person school.

## Runtime contract

`client/src/living-room.js` creates rooms and passages from the existing tower graph, places experimental seventh-year versions of Lily, James, Sirius and Remus in the common room, and configures their normal `setDailyLife` rules. After a fixed warm-up of 67 ten-minute ticks, each new `world.step()` is an autonomous simulation step. No individual move, conversation or invitation is scripted.

`PassiveRoomObserver` (RB-1) publishes only public room positions and validated `entity_moved` deltas. The scene builds sprites from those positions; it never assigns NPC actions. The activity card includes only interactions localized to the common room, not NPC beliefs or confidential runtime stores.

The viewer can walk between tower rooms; NPC simulation continues independently of the camera. One ten-minute world step occurs approximately every 3.6 real seconds. Browser animation **illustrates** each already-committed room transition with a 2.9-second departure/arrival; it is not authoritative continuous NPC physics.

## Boundaries

RB-2's action timeline and RB-3's timed command bridge remain independent tested building blocks. RB-4 does **not** yet feed autonomous scheduler decisions through them. Mid-action checkpoints, physical intra-room navigation and interruption-aware AI scheduling are future work. The scene is a four-person ECS sub-world, not an online client of the full school. Browser sprites and the local viewer avatar have no authority over character intentions.

## Verification

`client/tests/living-room.test.mjs` checks graph edges, real movement events, causal snapshots, local social activity and deterministic replay. `client/tests/browser-smoke.mjs` checks real WebGL occupant correspondence and world progress plus tower 0.4 architecture. Run `npm test`, `npm run build` and `npm run browser-smoke` from `client/` after installing both `simulation/` and `client/` dependencies.
