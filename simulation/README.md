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

**Boundaries:** for now there are no trust scores, reliability calculations, memory decay, decisions, free-form chat, or natural language parsing. Receiving testimony does **not** mean a character accepted it as certain truth. Evidence contains a kind, immediate source and event sequence; no multi-hop provenance yet. Lying in a test is a permitted system action, not a hardcoded personality trait.

## What next?

Add interpretation of contradictory beliefs, grounded trust and personality constraints, richer source chains, and autonomous decision making. Keep authoritative truth outside character cognition.

The source of truth for design remains the main repository `docs/` directory. This code is a small executable [GAME] model, not a statement of canon.
