# IP & Asset Policy

## Purpose

Проект Maradeurs сейчас рассматривается как приватный исследовательский / фанатский проект.

Цель этой политики — не останавливать разработку из-за гипотетического будущего релиза, но заранее не создавать ненужные технические зависимости от ассетов, которые потом трудно заменить.

Это не юридическое заключение.

## Core rule

> Private development may use broad references and temporary third-party material. Public distribution requires a separate audit.

## Asset classes

### Reference

Используется для:
- пропорций;
- исследования;
- визуального анализа;
- сравнения;
- реконструкции.

Не должен попадать в shipping build.

### Prototype

Может временно находиться в проекте для проверки gameplay / scale / layout.

Должен иметь понятный replacement path.

### Production candidate

Ассет, происхождение и условия использования достаточно ясны, чтобы потенциально остаться в проекте.

Статус всё равно пересматривается перед релизом.

### Original

Создан специально для проекта и не зависит от стороннего asset source, кроме обычных референсов.

Предпочтительный конечный статус ключевых игровых ассетов.

## Required provenance record

Для значимых сторонних материалов фиксировать:

```text
source_url
author / owner
date found
declared license
role in project
embedded in build?
replacement needed?
notes
```

## Strategic dependency rule

Критические системы не должны зависеть от невозможности заменить конкретный third-party asset.

Например:

Плохо:
```text
gameplay map coordinates
= raw vertices from downloaded Hogwarts scan forever
```

Лучше:
```text
scan
→ measured reference
→ our spatial graph
→ our geometry
→ gameplay systems
```

## Release gate

Перед любым публичным build / demo / release выполнить:

1. asset inventory;
2. provenance review;
3. license review;
4. identify embedded third-party content;
5. replace questionable temporary assets;
6. check branding / names / logos / music / voice / likeness issues;
7. separately evaluate overall fan-project IP risk.

Некоммерческий статус не считать автоматическим разрешением на публикацию.

## Current decision

Hogwarts photogrammetry scan from Sketchfab:

- **role:** Reference / Prototype
- **shipping assumption:** No
- **replacement strategy:** clean rebuild of exterior geometry and modular architecture
- **value:** silhouette, proportions, relative placement of exterior masses
- **research file:** [../../research/hogwarts-geometry.md](../../research/hogwarts-geometry.md)
