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
npm run play-demo
npm run week-demo
npm run planner-demo
npm run commitment-demo
npm run invitations-demo
npm run learning-purpose-demo
npm run intentions-demo
npm run play
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

## Experiment #9: persistence boundary and playable text student

Run `npm run play` for an actual interactive headless game. You control **James Potter** by entering commands; Lily, Remus and Peter continue their own schedules and routines on world ticks. The player is **the same ECS character type as any NPC**; `setManualControl(james, true)` changes only the source of decisions, not lesson, movement, magic or attendance rules.

Commands:

```text
look
status
people
go corridor
go classroom
wait 2
practice lumos professor
practice lumos
cast lumos
save my-school.json
load my-school.json
events
exit
```

Run `npm run play-demo` for an unattended reproducible sequence that reaches class, learns the Lumos concept, rehearses with a professor, performs independently and verifies save/load.

### Save format, replay and audit (v1)

`src/core/persistence.ts` is an **adapter** around `createSimulation()`, not another physical world. It records **successful external commands**, creation of entities/doors, setting of NPC dispositions, schedules and routes, prior learning, and each autonomous world tick. Internal commands generated by a tick are NOT recorded twice.

`serializeSimulation(game)` creates portable JSON with a version, operations and a canonical state audit. `restoreSimulation(data)` validates the format, replays the journal from a new ECS world, maps saved entity IDs to newly created IDs, and **fails if the recreated observations, beliefs, academic state, social memories, events or spatial state diverge**.

The text client persists an actual file through Node's filesystem; the core remains filesystem-agnostic. Tests exercise disk roundtrips, rejected actions, resumed simulation, state isolation, manual control, and **seven full elapsed days** (1,008 ten-minute ticks).

**[GAME] Critical limits:** this is a *replay-backed save*, **not yet a materialized checkpoint**. Loading a save currently costs time proportional to the whole journal, and saving includes an event-history audit. This is sufficient as a deterministic correctness baseline, **not** the final scalable storage solution for a population-wide academic year. Historical journal entries are trusted scenario/runtime data, not a hardened untrusted-input format or a cryptographic signature. Reproducibility relies on pinned code, deterministic policies and the same simulation version; schema migrations and version-to-version gameplay compatibility are still outstanding.

## Year-first development gate

**The standalone headless game must be genuinely playable across a complete academic year before any Unreal integration becomes a priority.** The acceptance gate includes: seven cohorts, four houses, teachers and staff; a curricular week and yearly calendar, attendance/learning/exams, social goals and memory, offline simulation LOD, save/restore across months and year boundaries, a human-playable text or debug client, and convincing unplanned causal stories.

Unreal may later implement rendering and detailed spatial physics, but it must not become the source of truth for school time, knowledge, personalities, history or the rules of magic. See `docs/technical/simulation-status-and-roadmap.md`.

## Experiment #10 — checkpointable seven-cohort school week

The test school contains **84 pupils** (7 academic years × 4 houses × 3 pupils), **7 subject professors**, **7 year-classrooms**, house common rooms and a central corridor. Each professor teaches a single class in each daily time slot, with a deterministic rotating curriculum of seven subjects. Students each have 15 lesson appointments: three per teaching day, five days a week. Saturday and Sunday pass on the same world clock, giving **7×24×6 = 1,008 ten-minute ticks** in one weekly run.

- `npm run week-demo` reports each day and the complete first-week attendance ledger.
- Lesson windows now accept **absolute minutes**, so school attendance persists across day boundaries. The first year receives the `Lumos` conceptual lesson in its first Charms period.
- **Scope**: this is population scheduling and teaching continuity, **not yet social life across every cohort**. Students share rooms and existing character systems, but no automatic meals, clubs, friendships or weekend activities are implemented for this school population. Professors are subject-assigned representative teachers rather than the canonical list of 1970s staff.
- The school generator and scheduler are separate modules; dynamic data stores are world-local and isolated from command validation.

### Materialized checkpoint v2

`world.checkpoint()` includes static creation blueprint plus **current ECS flags, relations, positions, class records, beliefs, observations, spell knowledge, pending goals, memories and event history**. `serializeCheckpoint(world)` and `restoreCheckpoint(data)` recreate the static topology, then **hydrate current state directly** — they do **not replay every historical tick**.

`npm run play` now writes these v2 checkpoints to disk. Older operation-journal saves (`version: 1`) remain readable with `restoreSimulation()`. New v2 checkpoints can be saved again after restoration and forked into independent futures.

This is a materialized-state milestone, not final persistence engineering: v2 still serializes the complete event history, does not compact old observations, has no schema migrations and does not prove performance at whole-year scale. Do not expose the privileged checkpoint state to NPC cognition.

### Scheduler extraction

`src/core/scheduler.ts` owns the deterministic timestep ordering, while `src/core/runtime-stores.ts` creates isolated memory and routine stores, and `src/core/runtime-snapshot.ts` maps all entity references during hydration. `Simulation.ts` still owns the authoritative ECS graph, command validation and state capture. Command handlers remain a separate planned extraction.
## Experiment #11 — the life between lessons

The seven-cohort weekly school now has a **Great Hall**, individual home rooms, meals, free-time encounters and nightly rest. All 84 pupils and seven subject professors have explicit daily-life plans. Students walk from dormitories through corridors to the Great Hall, eat only while present at meal windows and return to their respective houses in the evening. Dinner does not teleport people home.

- Repeated breakfast/lunch/dinner windows occur every day (including the weekend). `eat_meal` is a validated ECS command and writes an immutable-by-copy `mealHistory(actor)` record.
- Students share common rooms after dinner and during weekend leisure. `chat` requires a real co-location and two hearing-capable characters; it writes **the same social occurrence into both autobiographical memories**, accessible with `conversationHistory(actor)`.
- Peer choice is based on **people physically present**, the student's own directional trust and how often they have previously spoken. Topics are local interests: `lessons`, `castle`, `hobbies`. Reserved students usually converse during weekends; outgoing students can converse in the evenings. Both participants have a one-conversation-per-day limit; there is **no numeric friendship meter**.
- Each pupil returns home to rest overnight. `restHistory(actor)` stores concrete nights spent at home; late wandering means the character may not rest until it returns. An occupied class always takes precedence over autonomous daily-life decisions.
- State is correctly serialized by V2 checkpoints, including personal meal/rest histories, meetings, daily-life traits and plans. The legacy V1 replay format also records new external commands and configurations.
- `npm run week-demo` reports attended lessons, meals, conversations, nights of rest, and one example of a student's accumulating encounter history. `npm run play` now accepts `chat peter hobbies`.

**[GAME] Honest limits:** this is a deterministic social-*encounter* vertical slice, not genuine friendship formation, appetite physiology, fatigue penalties, complex relationships, autonomous clubs or homework. Subjects are representative, not a canonical historical teaching census. People do not know where distant friends are; interactions only happen when they are physically co-present. There is no need for LLM, 3D or Unreal to play these systems.

Next: meetings that produce actual social obligations, preferences that update from memories, activities beyond casual chat, subject learning across the calendar, and a repeatable multiweek school year.
## Experiment #12 — branched multi-floor castle and organic house clustering

The school-week world has a **stable, non-canonical multi-level spatial graph**, defined in `src/scenarios/castle-layout.ts`. The core owns each room's optional `{ floor, wing, kind, house }` metadata, which survives both the legacy V1 replay and V2 materialized checkpoints. Metadata tells the **world** where rooms belong; it does not magically reveal a map to NPCs.

### Current physical graph (42 places)

```text
Floors: basement (-1), ground (0), first (1), second (2), third (3), fourth (4)

  West staircase <- floor galleries / occasional bypasses -> East staircase
       |                   |                              |
  Gryffindor common    Great Hall (0)             Ravenclaw common
      (4/W)            Courtyard (0)                (4/E)
  Hufflepuff common    Hospital (1/W)             Slytherin common
      (-1/W)           Library (2/E)                (-1/E)
                Staff room (1/E), seven year-classrooms across floors 0–3

Each house common room -> boys' bedroom
                       -> girls' bedroom
```

- Two independent staircases connect all six levels. Some floors have alternative bypass edges; the courtyard has entrances from both ground wings. There are real possible routes **without passing through one universal hub**.
- Each house has a central shared lounge, plus two *terminal* bedroom branches. Students have explicit prototype `dormGroup` assignments, with `homeRoom` = bedroom and `socialRoom` = lounge. These are test-population placeholders, not biographical facts about canonical pupils.
- On weekends, pupils with a study interest may visit the **library**; those interested in exploring may visit the **courtyard**; others can remain in their house lounge. Social choices use only **co-present partners**, personal histories and trust, never hidden character positions.
- The **hospital wing is a genuine reachable room** but does not yet provide health or recovery mechanics. Bedroom labels are spatial and do not yet implement access/house/gender permissions; the next access-control system must use world rules rather than GUI locks.
- A deeper graph makes travel costs real. In the verified first weekly scenario, **834 class attendances were on time and 426 were late**, with zero fully missed classes. This is a real consequence of a deliberately coarse ten-minute travel model, **not a settled school-balance target**.
- In that same seven-day run, **248 conversations occurred within houses and 32 between houses**. Existing conversation histories already measure that mix; no fabricated friendship meters or scripted house-by-house dialogue.

Future spatial changes should extend the keyed topology and room semantics, not invalidate the distinction between factual world map, each character's partial knowledge of the map, and any later Marauders' Map. Room access restrictions and individual discovered routes are still upcoming.
## Experiment #13 — subject-based classrooms and individual curricula

The castle is now **49 spatial locations**. Dedicated classrooms belong to **subjects**, not to year levels: Charms uses a third-floor corridor, Potions a dungeon, the library has moved to fourth floor, Astronomy has a tower, Herbology is taught in a courtyard-connected greenhouse. Five elective teaching spaces and kitchens extend the graph. The room metadata contains an explicit `loreStatus` (`CANON / INFERENCE / GAME`) and optional source: **do not interpret our staircase connections or level approximation as canon**.

- **14 cross-house core groups** (two groups for each of seven years) and **12 subject professors** (7 core + 5 elective) in the population of 84 pupils.
- **Individual timetables:** a pupil inherits core sessions from a group; from year three onward each pupil selects two synthetic electives independently of others. The core programme deliberately rotates subjects, so one subject professor teaches a distinct group in each simultaneous slot.
- **Reservation validation:** each teaching session claims its professor, room and students. Teaching collisions fail loudly at scenario setup. Teacher and group provenance are stored in `Lesson` and remapped through snapshots/replay.
- **Weekly result:** 155 teaching sessions, 750 individual lesson entries, including 120 elective enrolments. 126 automated tests cover course differences, classroom reuse, collision freedom, spell provenance, checkpoints and seven-day continued simulation.
- **Limit:** this is NOT a canonical historical timetable or an advanced seventh-year syllabus. Daytime Astronomy, curriculum frequency and travel-time delays remain GAME approximations. Realism and year-scale progression come later.

For explicit book-evidence grades and room table, see [Hogwarts Academic Model](../docs/technical/hogwarts-academic-model.md). Earlier experiment sections in this README document **historical prototypes** and are superseded where they describe course-owned classrooms or the original 42-room world.

## Experiment #14 — time-aware school journeys and feasible meals

**Purpose:** stop treating a ten-minute fixed pre-class lead as sufficient for an entire castle. The spatial topology and academic timetable are unchanged: only each student's departure decisions change.

- Pure `school-planner.ts`: breadth-first shortest-hop estimate over the **public** room graph, with each edge currently costing one ten-minute action. A student with `schoolPlanning: 'adaptive'` starts toward the next lesson when its estimated travel time (plus one tick of slack) reaches the remaining time to class. The same authoritative movement and closed-door command rules still execute each hop.
- Meal decisions consider both the dining hall's physical distance and the next lesson. Pupils may start walking to lunch or dinner *before* the serving window, but **cannot eat outside it**. If eating would jeopardize a feasible lesson arrival, lesson preparation wins. A pupil already in class remains there throughout the lesson.
- Legacy twenty-minute lead remains the default for simpler scenarios and historical saves; the seven-cohort school enables adaptive plans by default. A/B scenarios can opt into `createSchoolWeek(world, 'legacy')`.
- Meals, attendance, lesson material and social memories remain authoritative world events. Decisions use clock, curriculum, owned meal records and building topology, **not hidden positions or thoughts of other people**. Future work: route discovery; the current planner still has perfect knowledge of public corridor connections.
- No teleportation, magic speed modifiers or arbitrary attendance fixes: each corridor edge still consumes a separate world step. Unreachable classrooms remain unreachable and genuine conflicts can still cause lateness or missed lessons.

**Matched seven-day benchmark** (84 identical pupils, 49 rooms, 155 teaching sessions, 750 personal class attendances):

| Outcome | Old planner | Distance-aware planner |
|---|---:|---:|
| On-time attendances | 298 | **684** |
| Late attendances | 452 | **66** |
| Completely missed | 0 | **0** |
| Pupil meals | 846 | **1548** |
| First-year pupils learning Lumos theory | 6 of 12 | **12 of 12** |
| Pupil conversations | 280 | **280** |
| Same-house conversations | 258 | **232** |
| Cross-house conversations | 22 | **48** |
| Nights rested | 588 | **588** |

Note that increased inter-house contacts may be produced by different timing and crowding; the scheduler has not acquired a friendship generator. Food is still an attendance-like event, not a physiological metabolic model. **The base clock begins at 08:00**, so long morning routes and late departures still have unavoidable consequences with this granularity.

Reproduce both worlds with `npm run planner-demo`; regression tests prove earlier departure without teleporting, correct meal windows, legacy behavior for unconfigured NPCs, and deterministic continuation through both journal replay and direct V2 checkpoint.

## Experiment #15 — personal promises, competing obligations and witnessed failure

**Scope:** This is a causal social-commitment **vertical slice** layered on top of the headless world; it does *not* automatically generate friendships or obligations in the seven-cohort baseline yet.

- A physically co-located, hearing-capable promisor can execute `promise_meeting` to a listener for a **future tick, reachable-or-unreachable specified room, and purpose** (`study` or `explore`). Invalid times, duplicate conflicts, inaudible and remote conversations are rejected by the authoritative command. The unilateral promise is heard by the listener; **negotiation and explicit acceptance** are not yet implemented.
- Both characters get **distinct autobiographical memories**: `promised` for the speaker, `heard_promise` for the listener. Their futures contain one scheduled meeting in the shared world ledger; their minds do not contain global meeting outcome.
- When a meeting approaches, each participant can walk to its location using normal validated edge-by-edge navigation. A character's `commitmentPriority` may be `school_first` (default) or `promise_first`. `school_first` preserves lessons, while `promise_first` can delay or miss a lesson. **There is no automatic teleport or arbitrary percentage of betrayal.**
- If both physically meet during the 20-minute appointment window, both remember `met`. Otherwise the meeting expires. **Only a participant actually standing at the agreed location** remembers `waited_alone`; an absent character never receives an omniscient resentment message.
- An NPC avoids a former partner whom they personally remember failing to arrive. This is derived from the **last relevant personal meeting memory**, not from a magic numeric friendship meter. Promises can be kept, broken, remembered and replayed deterministically after a V2 checkpoint or V1 journal restore.
- Teaching a spell concept during a timed class now **requires the named teacher to actually be present in the classroom at the explanation tick**; lessons without teacher identifiers preserve compatibility with older scenarios. Arriving late to an empty classroom still cannot create magical knowledge.

Run `npm run commitment-demo` to see the same two characters choose the lesson-first or promise-first plan and the resulting *local* memories, class attendance and meeting resolution. There are eight direct scenario tests plus two tests covering personally witnessed social avoidance and backward-compatible checkpoints.

**Important boundaries:** this experiment uses an explicit promise action invoked by a scenario/player; the full 84-pupil week is not yet creating promises of its own. Autonomous negotiation, invitations, consent, apology and reconciliation, true lesson exercises and teacher pedagogical intent remain future work. It is **not** yet a generalized social planner that chooses among arbitrary personal desires. Future chapters should make social promises emerge from private needs and evidence of actual relationships.

## Experiment #16 — autonomous social invitations and actual consent

**Goal:** make appointments arise *without a scripted encounter*, from repeated physical co-presence and the NPC's own conversation memory. An invitation is explicitly **not yet a promise**.

- New validated commands `offer_meeting` and `answer_meeting` extend the experiment #15 personal-commitment mechanism. The inviter must be in the same room as a hearing-capable invitee; the reply must also be given face-to-face. The recipient can explicitly **accept or reject** the proposed time, room and purpose. Only an accepted proposal becomes a scheduled meeting; rejected/unanswered offers carry no invented betrayal penalty.
- World-owned offer lifecycle: `offered` → `pending` (accepted), `declined` (rejected) or `unanswered` (no answer before cutoff). Existing accepted meetings still resolve to `kept` or `expired` **solely through the two characters' actual positions**.
- Each person receives only personally accessible memories (`offered`, `invited`, `accepted`, `declined`, `met`, `waited_alone`). Acceptance/decline requires a fresh audible encounter; nobody is informed remotely or reads hidden NPC desires.
- `socialInvitations: true` opts a daily-life NPC into the autonomous policy. Outgoing characters who already have a real conversation memory of a nearby person may propose **one appointment per rolling week** during leisure, for the following day's evening; they never search global character locations. The invitee weighs their own school timetable, trust, witnessed disappointments and social disposition before responding. A reserved student may refuse an exploration appointment. No numerical friendship score or fake chance roll.
- The standard 84-pupil school scenario enables invitations by default. The old control run remains available as `createSchoolWeek(world, 'adaptive', 'off')`. `npm run invitations-demo` compares both complete seven-day worlds and reports offers, acceptances, refusals, fulfilled meetings, attendance, meals, learned spells and conversations.
- New regression tests verify local consent, refusal, no telepathic acceptance, never inventing strangers' conversation memories, unanswered offers, both persistence formats and entire-week spontaneous encounters. Older `promise_meeting` intentionally remains a **unilateral declaration of personal commitment** for backward compatibility; it is not a mutually negotiated meeting.

**Measured seven-day A/B at fixed 84-pupil population and 49-room castle:** 56 spontaneous offers, 44 accepted and physically fulfilled, 12 explicitly declined, 0 unanswered or broken appointments. On-time lesson attendance remains **684/750** and late attendance **66/750** in both modes; meals change **1548 → 1542**, conversations **280 → 277**, cross-house conversations **48 → 52** and Lumos theory remains **12/12**. This is one deterministic scenario, not proof that every social context produces these proportions; same-room next-evening appointments are deliberately easier than negotiated long-distance meetings.

**Known limitations:** the prototype initiates invitations only between characters who previously exchanged a recorded chat, and picks a **test-fixture next-evening window** and the currently shared leisure room. The invitee's choice is deliberately deterministic and simplified. We still need richer time negotiations, proposals based on unsatisfied learning needs, rejection dialogue, apologies and rescheduling, more general personal agency, personal map knowledge and a multiweek population calendar.

## Experiment #17 — actual learning needs motivate social arrangements

**Purpose:** A learner who *really missed* the scheduled explanation of a spell can seek a tutor, propose an appointment, obtain the other's explicit consent, travel to the meeting, and learn **only when an actual qualified helper spends a separate action teaching**. Social co-presence by itself is **not** spell learning.

- `src/core/learning-intentions.ts` is a pure, small intention planner. It takes the learner's `knowledgeGaps()`, locally observed candidate identities, own failed attempts, directional trust, own witnessed disappointments, and clock. **It never reads another NPC's private knowledge to decide whom to approach.** The accepted appointment, not the planner, is authoritative.
- `learningAppointments: true` is an opt-in daily-life capability combined with `socialInvitations: true` and `setHelpSeeking`. The 12 synthetic first-years have this flag in the standard school-week setup; **healthy pupils with no missing concepts never fabricate a tutoring appointment**. Missed class or missed teacher explanation makes the genuine gap available to the individual.
- A `study` invitation may name a specific spell. The world rejects invented or already learned gaps and stores a spell-bearing invitation and personal memories. The addressee may consent only when *they themselves* actually understand the spell, are willing to help, have no conflicting class, and are not refusing for social reasons. An unqualified candidate can decline, and the learner can approach a different locally available person.
- At the agreed place and time, `tutor_appointment` is a **separate, guarded teaching action** by the named helper. Its canonical `tutor_spell` validation requires both people to be co-located, hearing-capable, a helper who truly knows the concept, and a learner who still lacks it. Knowledge is recorded as `LearningSource.kind='tutoring'`, and `assistanceHistory` records the actual helper. `taught: true` marks performed instruction; `kept` alone only means that two people met.
- If both people physically meet but no teaching action happens, the appointment is `kept` but the spell remains unlearned. If the helper does not arrive, ordinary observed-only `waited_alone` and subsequent partner choices still apply. These are two different failures.
- The V1 action journal and materialized V2 checkpoint reproduce proposals, consent, travel, successful teaching and learned provenance. New tests verify missed lessons, real instruction, incompetent helpers, alternative helpers, meeting-without-teaching, invalid/premature commands, deterministic continuation and unchanged school-week metrics.
- Run `npm run learning-purpose-demo` for the **qualified vs. unqualified** comparison and a seven-day control. The ordinary 84-pupil adaptive school week already teaches all 12 first-years Lumos in class, so this new behaviour is exercised by **deliberately missed-lesson test fixtures**, not claimed as 12 new tutoring requests in the healthy control week.

**Limitations:** a concrete intent is currently derived afresh from a knowledge gap; this is not yet a persistent general-purpose priority/goal queue. The next-day evening appointment and destination are simple [GAME] fixtures. The helper's willingness is deterministic, language is non-generative, and pupils still use a public map graph for navigation. Experiment #18 should own interruptions, resume semantics, motivational tradeoffs and richer negotiations across activities.

## Experiment #18 — resumable intentions, meals and sustained rest

**Scope:** First executable, opt-in slice of a **persistent general intention queue**, with bodily needs as world causes rather than quest-specific rewards. Existing homework/tutoring, class and social-commitment policies are still separate and must be unified later. The existing 84-pupil school week is a compatibility/control experiment, *not* a claim that all of its characters have adopted this new body model.

- `src/core/intentions.ts` defines pure deterministic intention ordering and physiological choices. Every `intentionPlanning: true` character can `intend_visit` a real room with `casual|important` significance and an optional deadline, or `cancel_intention`. World-local, persisted goals progress through `queued → active → paused → active → completed`, or `expired|cancelled`. Active goals pause on class obligations, approaching accepted appointments, meal urgency, required rest or a newer higher-priority goal. **An interrupted intention remains owned by the NPC** and can resume by re-routing from its *actual* current room.
- The body prototype records `{hunger, fatigue}` **only for opted-in characters**. These are internal continuous causal state variables, not HUD bars or abstract character-attribute debuffs. Hunger rises with simulated time, is reduced only by a **validated physical `eat_meal` action** during service hours, and can interrupt a casual trip. An important mission can defer a meal, but strong hunger eventually overrides it. You cannot feed someone by claiming they ate.
- Fatigue rises over waking ticks. It recovers **gradually over multiple ticks while physically at home during the sleeping period**, rather than from a one-time `rest_recorded` marker. The existing marker is still an attendance-like historical snapshot, *not* proof of eight hours' sleep. An exhausted actor can also seek an emergency daytime rest at home. Nighttime sleep interrupts an ordinary outing; only an important objective can justify delaying sleep for a while.
- No food is magically produced by the physiology model. If the dinner service has ended, `chooseNeedOrIntention` does **not** invent an edible item or revive a closed kitchen. Later food and water should have material sources, location, availability, quality, sharing and exceptions such as packed meals / kitchens.
- Existing timetables and consensual commitments retain their established schedule priority; all travel still executes through actual doors and one 10-minute tick per edge. Only an actual arrival completes `visit`, with no invisible teleport. The intention ledger and needs persist across V1 journals and V2 materialized checkpoints, correctly remapping destination entity IDs. Legacy checkpoints with no opt-in need or intention data remain readable. Corrupted modern checkpoints remain rejected rather than synthesizing fictitious histories.
- There is a new CLI A/B demonstration, `npm run intentions-demo`, for both an interrupted library trip and an important trip delayed by a school lesson. Tests also cover deadlines, cancellation, higher-priority displacement, bedtime pause/recovery, save/replay, world isolation and the unchanged school baseline.

**Explicit [GAME] constants for now:** 10-minute ticks, provisional hunger/fatigue increases and decreases, meal/wake windows and decision thresholds; these should be calibrated using days of real simulated behaviour. Neither need presently changes wand accuracy, knowledge, conversation comprehension or general health, and being at home at night is only a crude proxy for actual sleep. The goal queue presently executes **room-visit** intentions; spell-learning, investigations and social appointment decisions still use the prior specialised policies. Those are intentionally *not* described as unified goal planning.

**Next stages:** connect real study/appointment/social goals to the same intention engine; model edible objects, water, meal portions, social opportunities and a real sleep action/interruptions; introduce qualitative tiredness and hunger effects grounded in validated activities; choose priorities by needs, personal values and context rather than universal arbitrary score modifiers.

## What next?

Link the new resumable intention ledger to study, social agreements and investigations; then add tangible food and sleeping actions, personal map knowledge and multiweek school-term continuity.

The source of truth for design remains the main repository `docs/` directory. This code is a small executable [GAME] model, not a statement of canon.
