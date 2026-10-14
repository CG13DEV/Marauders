# RB-5.1 — Authoritative autonomous travel

**[GAME]** First bounded integration of the existing ten-minute NPC scheduler with RB-2/RB-3's authoritative seconds timeline. No free-running 3D motion is claimed.

## Scope and scheduling contract

`world.setAutonomousTimedTravel(actor,true)` explicitly opts an NPC into a different *execution* path for passage traversal. Default = off, including all 634-person load fixtures. The existing `runWorldStep` AI retains authority over goals and actor-local route selection. A move to an adjacent reachable room is submitted to `TimedWorldBridge` at the world tick's seconds timestamp. The corresponding `StepDecision` has `{ok:true,events:[],scheduled:true}`: acceptance is **not** a physical arrival. World ECS location and the public `entity_moved` event change only after the timed duration and after normal movement validation, not at schedule time.

While a timed move is active, ordinary scheduler actions for that actor are withheld. Another `execute(move)` cannot bypass the timed authority. A door that must be opened is still opened via the normal world command **before** a journey begins. Travel duration uses the actual physical passage minutes (`passageMinutes * 60`). `world.timedTravelOf(actor)` is a read-only public numerical projection of active leg progress; rendering FPS does not drive it.

The existing RB-3 `createTimedMovement().advance(untilSeconds)` is used to progress sub-tick time. `world.step()` still commits the next ten-minute boundary, advancing any pending timed legs in chronological order before evaluating new decisions. Interruption/resume are explicit bridge actions; the NPC's previous goal is not replaced by a fabricated new move while transit remains active.

## Invariants and deliberate limitations

- Legacy NPCs keep their exact previous navigation, normal commands and tick rates.
- One pending adjacent passage at a time. Multi-room travel follows successive scheduler decisions, not an invented instantaneous route.
- During a leg, the ECS room remains the last *committed* room until arrival. RB-5.2 must add a presentation projection for active travelers and local collision-safe motion. Do **not** interpret `currentRoom` as continuous coordinates.
- Current whole-tick V2 checkpoints **cannot** represent in-flight travel or partial-second timing; `captureRuntime()` continues to reject such saves rather than silently losing progress. Restoring a prior save invalidates stale bridge references. Serialized mid-journey state requires a future versioned checkpoint schema.
- This does not yet switch the existing RB-4 browser `createLivingRoom()` micro-world onto timed locomotion; rendering integration follows once scheduler correctness is verified.
- External commands aside from direct moves, or physics/meeting semantics for passing NPCs, are not a fully continuous action arbitration system. RB-5.3 should make transient presence and interruptions explicit rather than pretending it is already solved.

## Verification

Run `cd simulation && npm run typecheck && npm test`. `tests/autonomous-timed-travel.test.ts` checks an NPC's **own breakfast travel** decision, scheduled-vs-committed states, monotonic world time, manual interruption, door passage, opt-out compatibility, checkpoint rejection and restore invalidation. Required gate: whole Simulation Lab CI including 634-pupil soak before merge.
