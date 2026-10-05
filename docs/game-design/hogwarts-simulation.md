# Hogwarts Simulation

## Goal

**[GAME]** Хогвартс моделируется как персистентная школьная экосистема, а не как набор спавнящихся NPC.

## Persistent people

Каждый значимый студент и профессор имеет стабильный identity record:

Person
- identity
- house / role
- school_year
- timetable
- location state
- relationships
- knowledge
- academic state
- discipline state
- club memberships
- history

После разговора, конфликта, наказания или совместного события персонаж не возвращается к нулевому состоянию.

## Academic year transition

Каждый новый учебный год:
- выпускаются семикурсники;
- существующие ученики переходят на следующий курс;
- появляется новый первый курс;
- обновляются старосты и роли;
- пересобираются расписания;
- меняется набор предметов;
- обновляется состав клубов.

Выпускники не удаляются из сохранения. Они переходят в alumni / external world state и могут возвращаться.

## Exams

**[CANON]**
Особенно важны:
- O.W.L.s — пятый курс;
- N.E.W.T.s — седьмой курс.

**[GAME]**
Результат должен возникать из накопленного состояния, а не из одной мини-игры:

attendance + knowledge + practical skill + preparation → exam result

То же относится к NPC: результаты могут менять их дальнейшие предметы и карьерную траекторию.

## Social groups

Поддерживаются постоянные сообщества со своими:
- участниками;
- правилами вступления;
- расписанием;
- местами встреч;
- репутацией;
- историей.

Примеры:
- Slug Club;
- дуэльные сообщества;
- факультетские группы;
- неформальные компании;
- временные тайные объединения.

**[GAME]** Постоянный дуэльный клуб именно в эпоху Мародёров пока считается авторским решением, если не найден прямой источник.

## Off-screen simulation

История ученика должна продолжаться без участия игрока.

Пример:

Year 3: joins a club  
Year 4: befriends another student  
Year 5: fails an O.W.L.  
Year 6: drops the subject  
Year 7: becomes prefect  
After school: graduates

Игрок может увидеть только часть этой цепочки.

## Simulation LOD

Не каждый NPC требует одинаковой частоты симуляции.

Предпочтительная архитектура:

near player → full actor simulation  
same location → reduced simulation  
elsewhere school → schedule/event simulation  
off-campus → abstract persistent state

Персистентность не означает, что все персонажи должны тикать как Actor каждый кадр.
