# Hogwarts Geometry Research

## Goal

Собрать надёжную внешнюю пространственную основу Хогвартса, не превращая один сторонний ассет в неразрывную production-зависимость.

## Primary reference candidate

### Hogwarts Model Scan — Warner Bros Studio

Source:
https://sketchfab.com/3d-models/hogwarts-model-scan-warner-bros-studio-fb7143080e4e4b6abd4a5620f6b56436

**[RESEARCH]**

Модель опубликована как photogrammetry scan физического Hogwarts model из Warner Bros Studio Tour.

Предлагаемая роль:

```text
third-party scan
      ↓
reference / measurements / silhouette
      ↓
clean spatial study
      ↓
our blockout
      ↓
our modular production geometry
```

Не считать исходный scan финальным production mesh.

## Why this reference matters

Warner Bros. Studio Tour описывает Hogwarts Castle Model как физическую модель, созданную для первого фильма. Её архитектурные массы, дворы, башни и башенки реально снимались и дополнялись digital effects для экранных экстерьеров.

Official reference:
https://www.wbstudiotour.co.uk/the-experience/explore-the-tour/art-department/

Отсюда рабочий вывод:

> scan этой модели — очень сильный кандидат на baseline для киношного exterior silhouette и взаимного расположения крупных объёмов.

Это не означает, что он является абсолютной метрической истиной для всех фильмов.

## Known spatial problem

Киношный Хогвартс не обязан быть полностью геометрически согласован между:
- physical miniature;
- set interiors;
- real filming locations;
- later CGI revisions;
- разными фильмами.

Поэтому проект не должен слепо подгонять интерьер под scan любой ценой.

Рабочая модель:

```text
Exterior baseline
= Warner Bros miniature / scan

Interior baseline
= film sets
+ books
+ known spatial relationships
+ gameplay requirements
+ controlled magical non-euclidean exceptions
```

## Production strategy

### Phase A — private development

Допускается:
- использовать scan как визуальный reference;
- временно импортировать его в DCC / Unreal для масштаба и сверки;
- извлекать silhouette, proportions и relative placement;
- строить поверх него blockout.

### Phase B — project hardening

Постепенно заменять зависимость от scan:
- собственным blockout;
- собственной модульной архитектурой;
- собственными коллизиями;
- собственной topology graph;
- собственными материалами.

### Phase C — before any public release

Провести отдельный audit:
- какие third-party assets физически попадают в build;
- какие используются только как reference;
- известна ли их лицензия;
- есть ли необходимость заменить;
- какие IP-риски существуют независимо от asset license.

## Asset status

| Item | Role | Current status | Replacement path |
|---|---|---|---|
| Sketchfab Hogwarts scan | Reference / prototype | Third-party; release status not assumed | Rebuild exterior shell and modules |
| Warner Bros Studio Tour model | Canonical visual reference | Official film-production reference | Not embedded as asset |

## Geometry pipeline candidate

```text
scan
→ align orientation
→ establish scale
→ identify architectural masses
→ extract exterior landmark graph
→ rebuild clean blockout
→ map known interiors
→ detect impossible intersections
→ resolve with redesign or controlled magical space
→ production modularization
```

## Important principle

Хогвартс должен сохранять архитектурную правдоподобность, но не обязан быть абсолютно евклидовым.

Non-euclidean решения допустимы только там, где:
- они помогают согласовать известные канонические пространства;
- имеют лорное объяснение;
- не превращают весь замок в произвольный teleport maze.

## Relation to Marauder's Map

Геометрическая модель замка должна по возможности питать те же данные, что и gameplay topology.

Идеальная связь:

```text
Hogwarts spatial model
        ↓
room / corridor topology
        ↓
discovery state
        ↓
Marauder's Map projection
```

То есть карта Мародёров не должна быть полностью отдельной нарисованной системой, если её можно строить из реальной структуры мира.

## Open questions

- точный масштаб физической модели;
- к какой версии киношного Хогвартса ближе конкретный scan;
- какие крупные перестройки происходили между фильмами;
- какие film-set interiors физически несовместимы с exterior shell;
- какие зоны стоит моделировать как magical spatial exceptions;
- какие данные можно полуавтоматически извлечь из scan для Unreal/Houdini pipeline.
