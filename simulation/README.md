# Marauders — Headless Simulation Lab

The first runnable vertical slice of the Hogwarts simulation, using **bitECS 0.4** and TypeScript. This is a simulation, not an Unreal replacement.

## Requirements

Node.js 22.16+ and npm. The project uses Node's built-in TypeScript type stripping and `node:test` runner (no extra CLI/test runner dependencies).

## Run

```bash
cd simulation
npm install
npm run demo
npm start
npm test
npm run typecheck
```

Interactive commands: `look`, `go corridor`, `go library`, `go common_room`, `events`, `exit`.

## Current rules

- Rooms and characters are entities; identity, occupancy, and exits are expressed through ECS components and relations.
- An `LocatedIn` relation is exclusive: a character can be in exactly one room.
- `PassageTo` relations connect rooms bidirectionally. A character may only move to an adjacent room.
- Invalid commands do **not** mutate the world or emit events.
- Successful commands emit structured events; the CLI only renders them.
- Each simulation owns its component data, preventing state leakage between test worlds.

## Next experiment

Introduce world events, hearing/visibility rules, and per-character beliefs. First scenario: Lily witnesses a broken cup while another student only hears it through a closed door. Events must not imply omniscient NPC knowledge.

## Notes

The source of truth for design remains the main repository's `docs/`. The code here implements only a small **[GAME]** subset. There is no LLM, AI agent, persistence, network API, or magical physics yet. Do not infer that the entire planned world already exists.
