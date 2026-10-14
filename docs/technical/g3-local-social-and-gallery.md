# G3.1–G3.2 — Слышим друг друга, узнаём замок [GAME]

## Playable promise

A player-controlled Marauder can approach **a physically present NPC** in the Gryffindor common room and choose one of two authentic ECS interactions:

1. `talk` maps to the core `chat` command about school or castle life. Core social-memory and once-per-day limits apply. The client may summarize the *topic* but invents no specific NPC knowledge.
2. `ask_cup` maps to the existing core `ask_about` command on the real breakable common-room cup. The asker must have evidence of damage, and the respondent chooses among **their own belief ledger**. The world may refuse to answer or transmit a witnessed/testimonial claim; the UI must not turn hearsay into a first-hand eyewitness statement.

**Physical prerequisite**: player and NPC share the ECS room, NPC is not currently traversing an inter-room leg, their client micro-space position is reported locally and within a radius of 2.25 world units. `PlayerIntent` does not contain a transferable actor ID. This extends the existing G2 local reach adapter; the core ECS is the final authority for acceptance.

Character answers are deterministic **consequence descriptions**, not generated free-form dialogue. There is no LLM conversation or arbitrary question input. Response copy is authored from command result events, not from the omniscient world log. We must distinguish knowledge, silence and distance failures. An answer about the broken cup may be requested after **the player personally witnesses breakage** or **inspects the damaged object**. Both establish grounds in the existing ECS; asking before either observation is refused. Never require a redundant inspection from an eyewitness.

**Current time caveat**: the discrete `chat` command logs a world event but has not yet been generalized into time-occupied player activity. Do not claim realistic five-minute spoken conversations. Deliberate time cost/interruptibility belongs to G3.3.

## Spatial increment: gallery_4

[GAME] The canonical book floor numbering is not established by this client; the full `createCastleLayout` uses a provisional fourth-floor west landing. The node `gallery_4` and its edge with `west_landing_4` already exist in the **authoritative full-school topology**.

This PR includes `gallery_4` in the **build-generated client graph**, not a manually mirrored disconnected scene. `buildGallerySpace` produces a *distinct rectangular gallery* (stone gallery, portraits, windows, torches, floor panels and bounded walking surface), connected by the actual north staircase of the existing portrait landing. The stairs have two stages: approach and inspect the passage, then enter. The actor learns the gallery key only after standing by the stair and using the discover action. The return edge leads back to the same landing. ECS validates both transitions.

No invented canon claims or instant portals to the library. This is a tiny, grounded expansion of the existing castle, intentionally without new NPC spawns or lore secrets.

## Non-goals / risks

- No school-wide NPC conversation around sub-room proximity yet. This adapter applies to the four-NPC browser demonstration; school simulation social commands still use room-level prerequisites.
- Private NPC memory is not exported wholesale to the client, and quoted dialogue is limited to what action results establish.
- Full actor collisions, persistent individual exploration records, real listening through walls and physical sound propagation are not implemented.
- The full 634-person school is still separate from this four-NPC browser micro-world.
- The client floor plan deliberately inherits the experimental floor-4 location from `castle-layout.ts`; the canon Gryffindor entrance floor should be resolved separately.

## Test gate

`client/tests/local-social-gallery.test.mjs` validates no long-range chat, target nonexistence, once-per-day normal conversations, player's knowledge prerequisites, witness-backed question resolution, lack of remote NPC info, and a complete player passage to newly discovered `gallery_4`. Browser smoke continues to require proper Three.js rendering, normal tower navigation and WebGL. All must pass before merging.
