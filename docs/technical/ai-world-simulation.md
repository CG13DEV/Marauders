# AI World Simulation

## Goal

Использовать AI как слой семантической интерпретации и narrative continuity, не отдавая ему роль физического движка.

## Architecture

World State + Character State + Lore Rules + Player Action
→ Semantic Interpreter
→ Validated Intent / Parameters
→ Deterministic Gameplay Systems
→ Persistent Consequence
→ World State

## What AI may do

- interpret unusual player intent;
- generate context-aware dialogue within character knowledge;
- select plausible goals from a constrained action model;
- summarize off-screen events;
- infer lore-consistent consequences where rules permit several outcomes;
- help author dynamic social interactions.

## What AI should not own

- collision;
- rigid-body physics;
- authoritative transforms;
- inventory truth;
- spell cost truth;
- network authority;
- save-game truth;
- canonical fact storage.

## NPC memory

Prefer structured state over raw chat logs.

Example relationship state:
- person_a;
- person_b;
- trust;
- fear;
- admiration;
- resentment;
- known_events.

LLM receives relevant state and renders behavior/dialogue. It does not invent the persistent truth itself.

## Simulation LOD

NPC simulation can have layers:

Full Actor
→ Local abstract simulation
→ Schedule simulation
→ Event-driven off-screen state

The same persistent entity can move between these representations.

## Determinism

Critical world changes should be produced as validated commands and stored normally.

Example:

AI proposes: student decides to skip club meeting  
rules validate  
→ calendar event changed  
→ relationship consequence applied  
→ save state updated

This keeps AI expressive without making saves irreproducible.
