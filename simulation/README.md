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

## What next?

Make trust evolve from witnessed behavior, store richer chains of hearsay and long-term goals, and expand decisions beyond local inspection to asking witnesses or travelling to investigate. Character cognition must remain restricted to character-local data.

The source of truth for design remains the main repository `docs/` directory. This code is a small executable [GAME] model, not a statement of canon.
