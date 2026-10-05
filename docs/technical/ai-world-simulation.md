# AI World Simulation

## Goal

Использовать AI как слой семантической интерпретации и narrative continuity, не отдавая ему роль физического движка или источник истины о персонаже.

## Core principle

**[GAME]** LLM не является персонажем.

Персонаж существует в игровых данных: identity, personality constraints, goals, beliefs, knowledge, memories, relationships и текущее состояние.

LLM получает релевантный срез этого состояния и может предложить речь, намерение или вывод. Она не создаёт задним числом личность персонажа и не записывает выдуманное как факт мира.

Хорошая проверка архитектуры:

> если отключить LLM, персонаж всё ещё должен существовать, помнить значимые события, иметь цели и принимать ограниченный набор правдоподобных решений.

## Architecture

World State  
+ Character State  
+ Personality Constraints  
+ Goals / Beliefs  
+ Relevant Knowledge / Memories  
+ Lore Rules  
+ Player Action  
→ Semantic Interpreter  
→ Dialogue / Decision / Inference Proposal  
→ Rule Validation  
→ Deterministic Gameplay Systems  
→ Persistent Consequence  
→ World State

## What AI may do

- interpret unusual player intent;
- render context-aware dialogue within character knowledge;
- select plausible goals or actions from a constrained action model;
- propose an inference from known facts;
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
- canonical fact storage;
- hidden world knowledge unavailable to the character;
- persistent memory truth without validation.

## NPC knowledge boundary

**[GAME]** AI receives только то, что конкретный персонаж имеет право знать в текущий момент.

Knowledge context should be assembled from structured records with provenance and confidence.

Пример:

fact: Peter was near the greenhouse at 23:20  
source: overheard_from_student  
confidence: 0.45  
timestamp: yesterday

AI может выразить сомнение, подозрение или сделать вывод, но не должна превращать это в объективную истину мира.

## NPC memory

Prefer structured state over raw chat logs.

Useful persistent layers:
- semantic knowledge;
- episodic memories;
- salient / emotional memories;
- beliefs;
- relationship state.

Example relationship state:
- person_a;
- person_b;
- trust;
- fear;
- admiration;
- resentment;
- irritation;
- known_events.

LLM receives relevant state and renders behavior/dialogue. It does not invent the persistent truth itself.

## Character constraints

**[GAME]** Personality constraints должны ограничивать генерацию так же, как gameplay rules ограничивают физическое действие.

AI proposal can fail validation because:
- the character would not reveal that secret;
- the character does not know the fact;
- the proposed action violates a hard behavioral constraint;
- a required capability or opportunity is absent.

Character consistency is therefore a property of the simulation, а не только качества prompt.

## Simulation LOD

NPC simulation can have layers:

Full Actor
→ Local abstract simulation
→ Schedule simulation
→ Event-driven off-screen state

The same persistent entity can move between these representations.

Cognitive depth and spatial simulation LOD are separate axes: a core character may be simulated abstractly while off-screen without losing identity or memory.

## Determinism

Critical world changes should be produced as validated commands and stored normally.

Example:

AI proposes: student decides to skip club meeting  
rules validate  
→ calendar event changed  
→ relationship consequence applied  
→ save state updated

This keeps AI expressive without making saves irreproducible.

## Model-agnostic semantic layer

**[GAME / TECH]** Архитектура не должна зависеть от возможностей конкретной AI-модели или поколения технологий.

Проект долгосрочный, поэтому интерфейс должен оставаться стабильным даже при замене semantic model:

World Entity State + Authorized Context + Player Input → Semantic Agent → Proposed Response / Action → Validation → Game Systems

Сегодня Semantic Agent может быть небольшим LLM. Позже это может быть локальная realtime-модель, multimodal model или другой runtime. Замена модели не должна менять источник истины о мире.

Из этого следуют требования:
- world state хранится вне модели;
- character knowledge собирается отдельно и передаётся по необходимости;
- память имеет структурированное представление, а не только chat history;
- actions проходят validation;
- модель не получает скрытые факты автоматически;
- интерфейс допускает разные cognitive depth tiers.

## Cognitive AI LOD

**[GAME / TECH]** Разные классы сущностей могут иметь разную глубину semantic simulation.

Рабочая шкала:
- core living characters — personality constraints, goals, beliefs, long-term memory, rich relationships;
- important / named NPC — ограниченная долговременная память и social state;
- ghosts — отдельный класс с собственной моделью continuity;
- portraits — archetype, knowledge boundary, local observations, short context, optional salient memory;
- background magical entities — преимущественно реактивное поведение.

Это отдельная ось от spatial Simulation LOD. Сущность может быть визуально рядом, но когнитивно простой, или находиться off-screen, но сохранять глубокое состояние.

## Free-form conversation as interface, not authority

**[GAME / TECH]** Свободный естественный язык полезен там, где игрок исследует знание сущности, а не выбирает заранее написанную ветку.

Пример с портретом:

player asks an arbitrary question → intent is interpreted → portrait knowledge boundary is assembled → answer is generated within archetype and known facts

Важно: свободный вопрос не даёт модели права придумывать новый факт мира. Если портрет не знает ответа, корректный результат — незнание, отказ, предположение, слух или ложное убеждение согласно его состоянию.
