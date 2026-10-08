# Marauders — Headless Simulation Lab

A runnable Hogwarts simulation prototype using **bitECS 0.4**, TypeScript, and Node.js. This is a headless playground for rules; Unreal will be a separate client or runtime later.

## Requirements & launch

Node.js 22.16+ and npm.

```bash
cd simulation
npm install
npm run demo
npm run perception-demo
npm run social-demo
npm run agency-demo
npm run living-demo
npm run school-day-demo
npm run learning-demo
npm run help-demo
npm start
npm test
npm run typecheck
```

Interactive commands for the first-room scenario: `look`, `go corridor`, `go library`, `go common_room`, `events`, `exit`.

## ECS world

- Rooms, characters, fragile objects, and doors are entities with ECS components/relations.
- `LocatedIn` is exclusive, and `PassageTo` defines connections.
- Doors are entities with open/closed state. A closed door prevents walking or seeing through a connection, but the nearby crash can still be heard.
- Commands are validated before state mutation. Valid commands produce authoritative `WorldEvent` records.
- Observations are **separate**, per-character ledgers. A direct visual witness receives actor and object IDs; a listener behind a door receives only `heard_crash`, with no culprit or target reference.
- The authoritative `world.events()` debug log is **not** an input for NPC or LLM cognition. Only a character's `world.observations(characterId)` and `world.beliefs(characterId)` may be used as cognitive context.
- Each simulation owns its ECS stores, event log, observation and belief ledgers; test worlds are isolated.

## Experiment #2: who broke the cup?

Run `npm run perception-demo`. James breaks the cup in the Charms classroom in front of Lily. Remus stands across a closed door. Peter is in a disconnected library.

Expected: Lily witnesses James break it; Remus hears an anonymous crash; Peter receives no observation. Unit/integration tests also cover open doors, invalid actions, sensory disabilities, and world isolation.

**[GAME] Prototype assumptions:** sight and hearing are topological and room-based. One open passage can provide sight, regardless of fine-grained geometry. Any directly adjacent passage carries a crash sound, regardless of door state. No variable loudness, occlusion, memory decay, inference, autonomously generated rumor, or LLM is implemented yet.

## Experiment #3: testimony, lies and conflicting beliefs

Run `npm run social-demo` for the first social experiment:

- James breaks the cup. Lily witnesses it, while Remus hears only an anonymous crash.
- Lily opens the connecting door and Remus enters the classroom.
- Lily reports that James broke the cup. Remus stores this as **testimony from Lily**, not a direct observation.
- James blames Peter. Remus retains **both competing claims**, each attributed to the actual speaker. Objective world history still records James as the culprit.

Each observed breakage also creates a belief with `evidence.kind: 'vision'`. Claims have structured references (`culprit`, `object`); speakers may assert false claims but cannot invent entity IDs or inject omniscient event records.

**Boundaries:** for now there are no calibrated trust probabilities, memory decay, autonomous choices within this experiment, free-form chat, or natural language parsing. Receiving testimony does **not** mean a character accepted it as certain truth. Evidence contains a kind, immediate source and event sequence; no multi-hop provenance yet. Lying in a test is a permitted system action, not a hardcoded personality trait.

## Experiment #4: Remus investigates contradictory testimony

Run `npm run agency-demo`. Remus receives two mutually contradictory reports about the cup. A designer assigns him the **Inquisitive** ECS trait and directional attitudes: he trusts Lily and distrusts James.

The `assessReports` rule only reads Remus's personal, source-attributed beliefs. It returns an assessment with the two competing claims and a `favoredCulprit` lead. A favored lead is NOT an established fact.

During `world.step()` the NPC policy:

1. Looks for contested testimony in **that NPC's own beliefs**.
2. Considers only inspectable objects in **the current room** and only if the NPC can see.
3. Submits an ordinary validated `inspect_object` command if a relevant object has not already been inspected.
4. Records `inspected_object` with its observed broken state. This establishes whether the cup is broken; it does **not** reveal who broke it.
5. Does not repeat the same investigation endlessly. Without the Inquisitive trait, this policy does not execute.

Trust uses qualitative `trusted / neutral / distrusted` relations in bitECS, rather than made-up probabilities. Trust is directional, can change, and remains scoped to one simulation world. Repeated testimony by the same witness does not count as multiple independent sources.

**[GAME] Important simplifications:** trust and curiosity are initially configured by the designer, rather than emerging from relationships. This is a tiny deterministic policy, not a general AI planner. It deliberately does not resolve contradictory culprits through inspecting physical damage alone. Perception is still room-topological; within-room object visibility is assumed.

## Experiment #5: an independently moving, social school day

Run `npm run living-demo`. Unlike earlier hand-authored sequences, **each `world.step()` lets multiple NPCs take independent validated actions**:

- Lily receives a finite routine `[corridor, library]`. She walks there over consecutive ticks using an explicit public room map (including opening closed doors when needed). Her whereabouts aren't exposed to the other NPCs as hidden coordinates.
- Remus hears contradictory reports about the broken cup, inspects it, asks James what he knows, explores connected rooms, discovers Lily in the library and asks her as well.
- Guarded James can withhold self-incriminating first-hand knowledge. The answer remains *silence*, not a magically fabricated excuse or an automatic admission.
- Lily answers only using her own first-hand memory. Her response becomes Remus's **testimony with origin `vision`**, never Remus's own eyewitness fact. Retelling hearsay preserves `origin: { kind: 'testimony', speaker }` for the immediate prior hop.
- Without a clue about the object, a character cannot query an arbitrary object ID for secrets. Searching for a source follows locally discovered exits, one command at a time; in unreachable areas the search eventually stops without teleportation.
- `world.tick()` now advances once per `world.step()`. The tick is a deterministic simulation counter, not yet real-time school hours.

**[GAME] Prototype constraints:** routines are finite waypoint itineraries assigned externally; they are not full class schedules or autonomous goals. Room navigation relies on knowledge of the castle's public topology. Witness search is bounded depth-first exploration, with no hidden NPC position lookup. This is a local policy, not an LLM planner; response honesty is currently based on explicit personality constraints. Asking and answering require co-location and hearing; no semantic free-form conversation. Source ancestry is one level deep; we have not yet modeled multi-generation rumor transmission, reputation dynamics, or autonomous social goals.

## Experiment #6: school time, lessons, and consequences

Run `npm run school-day-demo`. The simulation advances **ten in-world minutes per `world.step()`**, from 08:00 on day one. The API `world.clock()` exposes the virtual time and `world.tick()` remains the discrete step counter.

- Characters may have individual `setTimetable(character, lessons, priority)` schedules. Lessons use unique IDs, subjects, room entities, and non-overlapping `startsAt`/`endsAt` minutes-of-day windows.
- The `lesson_first` policy reserves lesson periods and begins travelling up to twenty minutes before class. `inquiry_first` prioritizes autonomous investigation and only starts travelling when no investigation action is available.
- Movement and door-opening use the same validated ECS command pipeline as before; disconnected classrooms cannot be reached by teleportation.
- `world.attendance(character)` reports `pending`, `on_time`, `late`, or `missed` for each class. The world emits exactly one `lesson_attendance` event per resolved lesson.
- `world.learningDebt(character)` is the number of fully **missed** lessons, **not a complete skill or knowledge model**. Arriving late is tracked separately.
- The 08:00–16:00 demonstration simulates **48 world ticks** and timetables for Lily, James, Remus, and Peter. Lily visits the library, Charms, Herbology, and an afternoon study session. Remus arrives late to Potions because his investigation takes priority, then attends his later classes on time. James and Peter follow their own class schedules.

**[GAME] MVP boundaries:** attendance is recorded on first arrival inside a lesson window (or when the window ends without arrival). There is no teacher, lesson content, detention, knowledge acquisition, class participation, or early-departure penalty yet. The timetable covers **day one only** and does not repeat automatically on subsequent days. Ten-minute ticks can only distinguish arrival to that granularity. School priorities and subject choices are configured explicitly; they are not yet derived from evolving goals or emotions.

## Experiment #7: learning is not spell mastery

Run `npm run learning-demo`.

- Optional `spell: 'lumos'` on a lesson provides **conceptual knowledge at the teaching tick** (`startsAt + 10 minutes`) only if the pupil is physically in class. Being recorded as late does **not** retroactively confer missed teaching.
- `world.learningHistory(character)` records concrete stages and origins: `conceptual`, `guided`, `independent`. `world.knowledgeGaps(character)` identifies specific missed spell concepts, independent of the existing attendance-based `learningDebt`.
- `tutor_spell` lets a physically present, knowledgeable pupil explain theory to a second pupil who can hear. The teacher must know the pattern; the learner receives concepts, **not the ability to cast**.
- `practice_spell` validates an explicit spell pattern (`intent + semantic target + incantation`). A novice at the conceptual stage needs a nearby guide with independent execution experience. Successful guided practice yields `guided`.
- An `Experimental` ECS trait allows a pupil with prior guided success to attempt the same pattern autonomously on a later eligible tick. Successful rehearsal advances to `independent`; only then is `cast_spell` permitted without the practice path.
- The initial spell `Lumos` creates an `Illuminated` ECS state on the caster. This is a minimal physical effect; no illumination geometry, concentration costs, duration, failure probability, targeting physics or wand model yet.
- Prior knowledge for a teacher can be seeded at scenario construction time via `seedSpellKnowledge`; NPCs never learn hidden information from the world event log.

**[GAME]** This is an executable, deliberately constrained subset of the spell progression in `docs/game-design/progression.md` and semantic pattern model in `docs/lore/lore-and-magic.md`. Understanding, guided execution, and independent performance are distinct states, **not RPG experience levels**. Instruction currently occurs at one fixed lecture tick; tutor explanations are instant validated commands, and physical light is represented only as a marker.

## Experiment #8: voluntary peer tutoring, relationship memories

Run `npm run help-demo`. After setting up the school day, **no external commands steer the students**: ten-minute `world.step()` advances the simulation.

- Remus prioritizes investigating contradictory reports and arrives in Charms **after the Lumos teaching tick**. Lily learns the theory in class; Remus has a named `lumos` knowledge gap.
- The `SeeksHelp` ECS trait lets a pupil notice *only their own gap and locally present, audible people*. He does not peek into Lily's knowledge or see hidden whereabouts. Initially he distrusts the two students who gave him conflicting reports.
- `ask_tutoring` is a validated request. It requires a known, still-missing lesson concept, physical co-location and hearing. The request itself transfers no knowledge. A character remembers whom they already asked and does not repeat rejected requests indefinitely.
- The recipient autonomously chooses whether to respond according to the `Helpful` trait, **their own** knowledge and **their own** directional trust toward the requester. A learner cannot force a teacher to help.
- `lesson_first` commitments reserve time. A busy helper postpones the conversation. The two participants consume a social action slot for the tick; they cannot tutor and move away in that same tick.
- An accepted `answer_tutoring` delegates to the *existing validated* `tutor_spell` action. The learner receives the **concept**, not guided or independent execution. A refusal shares no secret information.
- Successful help creates a directional `HelpedBy` ECS relationship and a structured `assistance(character)` record. We explicitly **do not** increment a relationship score or automatically flip a neutral relationship to trusted.
- Requests, decisions and tutoring results are authoritative world events; personal learning and social memory remain in separate, world-local stores. Both memories are returned as defensive copies.

**[GAME] Limitations:** these are opt-in, deterministic social dispositions and a tiny learning-help policy, **not** genuine autonomous desires or nuanced emotional bonds. Only locally present candidates are considered. Request scheduling does not include invitations, correspondence, travel to a known mentor, school rules about talking during lessons, or time-consuming tutoring spanning several ticks. The ten-minute action slot is a coarse approximation.

## What next?

Make favors influence *specific later decisions* instead of generic affinity; extend tutor communication to guided practice and mutual study plans. Eventually introduce teachers' own schedules, interruptions, context-sensitive helpfulness and observable social history.

The source of truth for design remains the main repository `docs/` directory. This code is a small executable [GAME] model, not a statement of canon.
