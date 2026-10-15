# G3.3 — Conversation consumes world time [GAME]

## Player experience

A player who is physically near an actual co-located NPC can start `talk`
or `ask_cup`, but **does not receive a story fact immediately**. The action
reserves the controlled character until its authoritative duration elapses:
ordinary `chat` lasts **90 world seconds**; a focused cup inquiry lasts
**45 world seconds**. The existing `world.execute` command commits only
after the action finishes, so once-per-day conversation memory and any
testimony have one authoritative origin.

While occupied, the player cannot walk, use an object, cross a portal or
start another action. `cancel_interaction` explicitly interrupts the action.
Already elapsed time stays elapsed; cancellation creates **no social fact**.
A departing / travelling listener causes interruption, not testimony from
a person no longer present. On completion, the original ECS preconditions
are checked again. A race with autonomous social choices can validly result
in `already_chatted` or another ECS rejection instead of fabricated success.

Accepted player commands remain bound to the manually controlled ECS actor.
No command accepts a renderer-supplied actor ID, and replies still originate
from the **respondent's own beliefs**, not world events or remote memory.

### One clock and deterministic scheduling

GameSession holds at most one pending player action. Its `endsAt` uses
`world.worldSeconds()`, not `performance.now()`, frames or `setTimeout`.
`advanceSeconds` splits at the earliest of the next scheduled ECS tick,
NPC arrival, player action completion and requested horizon. The same
sequence of decisions and outcome must occur whether the caller advances
one second or a single 90-second segment.

The participating NPC's bounded common-room activity is temporarily
`talking`: the person stays at the conversation site instead of wandering
off due to decorative furniture navigation. **Actual ECS departures win**;
a timed traveller is never immobilized or kept in the room by presentation.
Outside an active interaction NPC room activities remain independent.

`lastInteraction` in the player's own session view captures a completed,
interrupted or rejected action. The UI exposes progress, disables conflicting
controls and offers a clear **Прервать разговор** button. Responses arrive
on completion, not when the player first clicks.

### Small physical castle growth

The existing real graph node `gallery_4` now contains a walkable **stone
bench niche**. The bench has a matching client + player-space collider and
physical approach point. From there `wait_gallery` occupies the player for
**60 world seconds**. No other room or fake passage was invented; the real
school clock advances, and the personal journal records a rest only on
completion. The bench is a deliberately modest interactive spatial increment
that gives time a tangible affordance.

## Boundaries (important)

- The school core still schedules everyday decisions every ten minutes;
  its `conversation_shared.minute` is **quantized to school ticks**, even
  though G3.3 tracks true elapsed world seconds for active-player actions.
  Do not claim exact-second social history in the core.
- This is a **four-NPC browser micro-world**. The gallery wait and active
  player actions live in GameSession memory and are **not persisted** by
  RuntimeSnapshot V2. Reloading loses an unfinished conversation.
- Current intra-room distances and NPC conversation reservations belong
  to the bounded local client adapter, not core ECS spatial physics.
- No system for scheduling multiple simultaneous NPC conversations, free
  spoken dialogue, full-school audible range, temporal save/load or player
  network authority is claimed.
- The gallery bench is an intentional [GAME] addition, not canon furniture.
- G4 (Lumos as an authentic perception/light change) remains a separate task.

## Regression gates

`client/tests/local-social-gallery.test.mjs` covers start/no premature
answer, occupied-player command rejection, cancellation, world-time
completion, polling-cadence independence and legal use of the new bench.

`client/tests/browser-smoke.mjs` checks actual visible timed conversation
feedback and withheld answer until world-time completion. Existing G1/G2/G3
player geography and test-mode restrictions must remain valid.
