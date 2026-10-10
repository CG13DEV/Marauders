# Башня Гриффиндора: источники и визуальная реконструкция

Исследование для 2.5D Three.js-клиента. Не существует одного
«исчерпывающего плана Хогвартса»: книги, кино, декорации и игровые
интерпретации допускают разные геометрии. Ниже фиксируем **проверяемые
опорные сведения**, открытые вопросы и то, что выбрано ради игры.

## Базовые сведения

| Утверждение | Уровень | Источник и интерпретация |
|---|---|---|
| Вход в гостиную через портрет Полной дамы с паролем | CANON | [Official HP Encyclopedia — Gryffindor common room](https://www.harrypotter.com/fact-file/locations/the-gryffindor-common-room) |
| Гостиная круглая, оформлена в красных/золотых тонах, с диванами и камином | CANON | [Official Encyclopedia](https://www.harrypotter.com/fact-file/locations/the-gryffindor-common-room) и [официальный обзор факультетских гостиных](https://www.harrypotter.com/features/everything-we-know-about-the-hogwarts-common-rooms) |
| Из гостиной ведут две винтовые лестницы к спальням мальчиков и девочек | CANON | [Everything we know about Hogwarts common rooms](https://www.harrypotter.com/features/everything-we-know-about-the-hogwarts-common-rooms) |
| Вход в башню со стороны замка находится на седьмом этаже | CANON (по книжным сведениям в Lexicon) | [Harry Potter Lexicon — Gryffindor Tower](https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/gryffindor-tower/) |
| Семь спален мальчиков и семь девочек (по одной на курс) | INFERENCE / книжная модель | [Harry Potter Lexicon — Gryffindor Tower](https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/gryffindor-tower/); не количество комнат исследовательского мира на 600 учащихся |
| Круглая спальня, кровати с пологом, насыщенно-красные занавеси, сундуки у изножья, высокие узкие окна | CANON (описанная спальня Гарри, поздняя эпоха) | [Harry Potter Lexicon — Harry's dormitory](https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/gryffindor-tower/harrys-dormitory/) с отсылками к PS7, CS5, OP17. Применение визуальных деталей к эпохе Мародёров — INFERENCE |
| В книжной модели мальчикам недоступна девичья лестница (превращается в горку) | CANON | [Harry Potter Lexicon — Gryffindor Tower](https://www.hp-lexicon.org/place/hogwarts-school-of-witchcraft-and-wizardry/gryffindor-tower/). **Пока не реализовано:** клиент не моделирует пол персонажа или такую магию |
| Изношенные диваны, массивный камин, ковры, настенные гобелены и уютный тёплый свет | FILM REFERENCE / INFERENCE | [Official making-of Gryffindor common room](https://www.harrypotter.com/features/gryffindor-common-room). Сет-декорации не равны каноническому метрическому чертежу. |

## Решение на первый прототип: сохранить граф

Авторитетная игровая топология:

- \`simulation/src/scenarios/castle-layout.ts\`: \`west_landing_4\` ⇄
  \`dorm_gryffindor\` ⇄ \`boys_gryffindor\` / \`girls_gryffindor\`.
- \`simulation/src/scenarios/school-week.ts\`: в конфигурации
  \`research-600\` дополнительные физические комнаты
  \`research_dorm_gryffindor_y{YEAR}_{boys|girls}_{N}\`
  **напрямую соединяются** с \`dorm_gryffindor\`. Они группируются в UI
  по лестнице и курсу, но **не** соединены невидимыми новыми проходами.
- \`simulation/src/scenarios/school-population.ts\`:
  Gryffindor cohorts \`[22,20,23,21,22,20,22]\` — 150 человек,
  чередующееся boys/girls распределение по \`index%2\`,
  вместимость **5 на спальню**.
- Точный результат: курсы по парам wings =
  **6 + 4 + 6 + 5 + 6 + 4 + 6 = 37** исследовательских спален.
  **2** старых экспериментальных узла остаются достижимыми и
  показываются отдельно как комнаты без жильцов; всего **39**.
- Граф привязывает гостиную к **floor=4**. Это **[GAME]**,
  расхождение с седьмым этажом из книжной справки. Клиент использует
  \`west_landing_4\` как идентификатор, а не выдаёт его за книжный факт.
- \`client/scripts/generate-graph.mjs\` получает комнаты и связи
  **из настоящей созданной симуляции**, считает население через
  \`world.occupants\`; \`client/tests/graph.test.mjs\` ловит дрейф
  количества и связей при будущих изменениях ядра.

## Художественный язык [GAME]

Первая сцена использует низкополигональные каменные цилиндры, сегменты
кольцевых стен, альковы, два условных витка лестниц, бархатные красные диваны,
тёмное дерево, окно с переплётом, камин с процедурным светом и круглые
спальни с пятью отдельными пологами (в пустых местах ткань иного оттенка).
Это **самостоятельные procedural primitives**, а не выгруженные
кинодекорации, фанатские меши или скриншоты игры.

Восемь направлений спрайта — [GAME] техническое решение для камеры.
Персонаж в первом прототипе не тождествен конкретному книжному герою.

## Нерешённые архитектурные вопросы

1. Точный масштаб гостиной/дверей, лестничных маршей и относительная высота спален
   не заданы каноном.
2. Настоящая топология stairs/landings расходится со звёздным графом.
   Нельзя добавить промежуточные игровые пространства без миграции
   авторитетной топологии и регрессионных тестов.
3. 37 исследовательских спален не претендуют на 14 канонических комнат.
   Перед более реалистичной моделью школы нужно выбрать согласованную
   систему помещений/вместимости и политику реконструкции.
4. Граница between short-step ECS rooms и непрерывным движением остаётся
   экспериментальной: точные координаты, поведение коллизий и плавная
   межкомнатная навигация — задачи следующего интеграционного этапа.
5. При публичной публикации фанатского прототипа соблюдать
   \`docs/production/ip-and-asset-policy.md\`; никакого копирования
   студийных материалов в client bundle.

См. также [общий Hogwarts geometry research](hogwarts-geometry.md).
