# Marauders — Headless Simulation Lab

A runnable Hogwarts simulation prototype using **bitECS 0.4**, TypeScript, and Node.js. This is a headless playground for rules; Unreal will be a separate client or runtime later.

## Requirements & launch

Node.js 22.16+ and npm.

```bash
cd simulation
npm install
npm run demo
npm run perception-demo
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
- The authoritative `world.events()` debug log is **not** an input for NPC or LLM cognition. Only a character's `world.observations(characterId)` may be used as sensory context.
- Each simulation owns its ECS stores, event log, and observer ledgers; test worlds are isolated.

## Experiment #2: who broke the cup?

Run `npm run perception-demo`. James breaks the cup in the Charms classroom in front of Lily. Remus stands across a closed door. Peter is in a disconnected library.

Expected: Lily witnesses James break it; Remus hears an anonymous crash; Peter receives no observation. Unit/integration tests also cover open doors, invalid actions, sensory disabilities, and world isolation.

**[GAME] Prototype assumptions:** sight and hearing are topological and room-based. One open passage can provide sight, regardless of fine-grained geometry. Any directly adjacent passage carries a crash sound, regardless of door state. No variable loudness, occlusion, memory decay, inference, rumor, or LLM is implemented yet.

## What next?

Perception events should flow into structured *beliefs* with provenance and confidence, so that hearsay can be false without altering world truth. After that: speech, misinformation, schedules, and the beginning of autonomous NPC decision making.

The source of truth for design remains the main repository `docs/` directory. This code is a small executable [GAME] model, not a statement of canon.
