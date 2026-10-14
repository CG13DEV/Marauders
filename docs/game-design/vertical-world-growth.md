# Small, meaningful castle growth with each gameplay PR [GAME]

**Agreed working rule (2026-10-14)**: Every substantive **gameplay feature** PR should expand the explorable castle by **one useful, physically coherent feature**, not just increase simulation and UI complexity. Examples: one playable room, one corridor segment, a meaningful alcove, or a real affordance in an existing room that affects play.

"More geography" means these five conditions:

1. **Source and provenance.** Prefer rooms/edges that already exist in `simulation/src/scenarios/castle-layout.ts` or school fixtures; mark anything newly inferred as INFERENCE/GAME. Do not alter canonical spatial facts merely to fill a quota.
2. **Topology.** Real endpoints and bidirectional traversal in the authority graph, appropriate travel time, doors/conditions; never a graphical arch that points to nowhere (unless explicitly marked unfinished).
3. **Geometry.** Room bounds, believable entrances and exits, no windows as doors, collision-safe paths, and readable architecture. Avoid duplicate round rooms where the location should be a corridor.
4. **Subjective discovery.** The player learns the location by seeing, reaching or being told about it. A new room should not silently appear in an omniscient in-game menu.
5. **Playable consequence + test.** The expansion offers exploration or a fitting activity, with a test for actual entrance/return and coherence across world and client.

A narrow bug-fix, security, CI or refactor-only PR need **not** add arbitrary rooms. Never force geography into an urgent regression repair. If a gameplay PR has no safe geographically coherent increment, clearly explain why and schedule a separate spatial PR instead.

**G3 increment:** `gallery_4`, the next actual castle graph node beyond `west_landing_4` at the portrait staircase, with original rectangular architecture and player-controlled discovery. Further increment candidates: a branch off that gallery toward a school location already represented in the headless ECS graph, after explicit layout and movement checks.
