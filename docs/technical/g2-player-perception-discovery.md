# G2 — Мир глазами игрока [GAME]

**Status:** bounded playable vertical slice in `client/`. It is a four-NPC ECS micro-world in the browser, **not** the 634-person authoritative server. This document distinguishes model authority from temporary presentation and prototype knowledge.

## Experience

The default client no longer shows the full developer graph. It presents a personal journal based on the controlled Marauder's **own ECS observation ledger**. Players discover destinations by approaching a wing stairwell and examining its door labels. The known-room list grows; a character cannot use the public `submit` API to open an unknown destination. This is subjective route knowledge layered on top of `world.knownExits(player)`, not a new physical shortcut through the castle.

**Debug-only** `?debug=1` / `?testMode=1` reveals the former full tower navigation panel. It still cannot skip proximity and ECS movement checks. An ordinary player sees room names and personal observations, not a global 39-bedroom count or room occupation counters.

## Invariants (causal)

- `world.setManualControl()` and ECS `currentRoom(playerId)` remain authoritative for the actor's **room**.
- `createPlayerSpace()` is a bounded **session-authoritative local-coordinate adapter** for the player's position within a scene, shared between input and world interaction checks. It validates finite, small movement increments, swept paths against the *same common-room obstacle plan* as RB-5.3, and landing/bedroom bounds. The Three.js sprite follows accepted positions only.
- Object actions `inspect_cup` and `break_cup` are refused by the session if the player is more than 1.85 world units away; successful actions then go through the normal ECS `inspect_object` and `break_object` commands. Within-room reach is **not yet a core ECS component** and must not be advertised as full physical-world authority.
- All room transitions require personally known destinations, proximity to the actual current door/stairs and a successful ECS `move` command. The destination must be an actual topological neighbour; neither the camera nor the debug UI can teleport to it.
- On the physical approach to a stairwell, `survey_wing` reveals signed doors on that wing. This is a deliberately coarse **[GAME] affordance:** one stairwell grants all signed rooms on that shaft because today's graph compresses all stair flights into one common-room adjacency. We are **not** claiming a player magically knows the inhabitants, room occupancy, unseen interiors, or a fully mapped multi-floor castle.
- Player `journal` consists of locally earned sign inspections (currently GameSession knowledge, not ECS saved facts) and events in `world.observations(playerId)` such as personally inspecting or witnessing the cup's destruction. It never reads another NPC's beliefs or the global event stream as player knowledge.
- Public room snapshots and active journeys exposed to Three.js now include **only actors co-located with the player**, not private remote movements. Development full-world state remains internal to the simulator, not `playerView`.

## Known limitations and next priorities

- Knowledge of signed doors and player floor positions currently lives in the browser's `GameSession`, not in `RuntimeSnapshot V2`. Refreshing the page resets the prototype. Neither multi-client integrity nor protection against a browser owner inspecting local JS internals is promised.
- The local room engine and the Three.js stage use related but not yet a **single reusable geometry schema** in all spaces. Common-room furniture sweep uses RB-5.3 rules; other rooms have simple bounds and client-side obstacle tests. Precise position + NPC/player collision and authoritative physics remain G2.2.
- `walk` messages are incremental position checks and **do not independently deduct world seconds**. In the browser, the simulation clock still advances with a separate game-time timer. Coupled stamina, time-per-action and wait mechanics require G3.
- Player vision is room-topological, not rays/occlusion/line of sight; a cup near the boundary is hidden by an approximate sight radius. Full sensory perception should be produced by one shared world perception model later.
- Stair door surveying is currently an immediate local knowledge action; study actions and future secret passages must use validated knowledge transitions and persistence, not a cosmetic checklist.
- Existing model's room graph collapses each year's stairs into direct links. Multi-storey exploration and physically distinct door positions are future geometry work; do not invent routes without world nodes.
- NPC awareness of a cup being broken continues to follow the existing room-level perception model, not sub-room position.

## Playtest / automated acceptance

- Choosing a Marauder leaves exactly one `ManuallyControlled` ECS actor; other NPCs remain autonomous.
- The player cannot inspect or break the cup from the entrance; walking close allows it and creates personal observation/history. Leaving the common room hides current cup state.
- A non-surveyed stair's doors are not added to `knownRooms`. Surveying from afar is denied. Inspecting physical signage adds personally known destinations; other wings remain unknown.
- Invalid physics increments and world commands cannot move player, bypass closed/absent passages or spoof someone else's actor.
- Normal browser render hides the full technical map; test mode can examine it, but **not** use it as a teleport.
- `client/tests/player-session.test.mjs`, `client/tests/living-room.test.mjs`, and Chromium `client/tests/browser-smoke.mjs` exercise those behaviors and regression-check previous G1/RB movement.

Related vision: `docs/game-design/progression.md`, `docs/game-design/marauders-map.md`, design proposal PR #65. Longer-term goal: observation → prediction → player agency → emergent consequences, not quest markers.
