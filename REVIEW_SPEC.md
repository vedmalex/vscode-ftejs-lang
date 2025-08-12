🤖 Memory Bank 2.0 — No-Git (Min) + LEVER
  MODE: MIN + LEVER Framework
  NO GIT | NL input | Code edits only in IMPLEMENT | LEVER analysis
  🔍 SCANNING: Checking for bugs, must-haves, and reusable patterns...
  Quick note: Loaded LEVER.md, BUGS.md, MUST_HAVE.md; cross-checked with source/tests. Ready to walk through and propose next steps.

  Обзор `LEVER.md` по разделам

  • Leverage Existing Patterns
    • [LEV-001] walkAstNodes(ast, callback) — реализовано (см. Applied). Проверьте, что все места действительно переведены на astUtils и нет локальных обходов AST.
    • [LEV-002] parseAndFormat(...) для тестов — реализовано (см. Applied).
    • [LEV-003] getTemplatePathVariants(basePath) — реализовано (см. Applied).
    • Предложение: отметить чекбоксы в верхнем списке как выполненные, чтобы не дублировать статус с “Applied LEVER”.
  • Eliminate Duplicates
    • [DUP-001] Общий Prettier mock — выполнено: server/__tests__/testSetup.js.
    • [DUP-002] Консолидация обходов AST — покрыто [LEV-001].
    • [DUP-003] DEFAULT_FORMAT_SETTINGS — выполнено (см. Applied).
    • [DUP-004] Унитизация соответствия расширений между клиентом и сервером — осталось. Цель: одна таблица расширений и единый источник правды для .nhtml/.njs/.nts/.nmd.
  • Reduce Complexity
    • [COMP-001] Разбивка server.ts (>1400 строк) — еще не начинали. Наиболее выгодный шаг по поддерживаемости: выделить completion, diagnostics, navigation, formatting.
    • [COMP-002] Выделение AST-утилит — частично сделано: server/src/astUtils.ts.
    • [COMP-003] Общие тест-хелперы — частично: testSetup.js + parseAndFormat(...) (из Applied). Можно централизовать в server/__tests__/helpers/ и переиспользовать повсеместно.
  • Applied LEVER (готово)
    • walkAstNodes, getTemplatePathVariants, общий тест setup, parseAndFormat, DEFAULT_FORMAT_SETTINGS.
    • Эффект: меньше дублирования; проще менять расширения; упрощены тесты. Все тесты зелёные.


  Рекомендованные следующие шаги (по убыванию эффекта)

  1) [COMP-001] Модульность `server.ts`
    • Разбить на completion.ts, diagnostics.ts, navigation.ts, formatterCore.ts (последний уже есть), плюс тонкий index/server.ts.
    • Влияние: высокая поддерживаемость, более быстрые точечные изменения.

  2) [DUP-004] Единый маппинг расширений клиент/сервер
    • Вынести в общий модуль (например, shared/templateExtensions.ts) и импортировать с обеих сторон.
    • Влияние: единая точка правды, меньше регрессий при добавлении/изменении расширений.

  3) [COMP-003] Консолидация тест-хелперов
    • Создать server/__tests__/helpers/index.js с экспортами parseAndFormat, общих констант и утилит.
    • Влияние: ускорение написания тестов, меньше дублирования.

  4) Синхронизировать чекбоксы в верхних списках LEVER.md с блоком “Applied LEVER” (косметика, но убирает двусмысленность).
  Хотите, чтобы я сразу:
  • синхронизировал чекбоксы в LEVER.md,
  • или перешел к IMPLEMENT по одному из пунктов (рекомендую начать с [DUP-004] или [COMP-001])?
  • Выполнил: загрузил LEVER.md, сверил с кодом и тестами, наметил краткий план.
  • Итоги:
    • Выполненные из Applied: walkAstNodes, getTemplatePathVariants, общий тест setup, parseAndFormat, DEFAULT_FORMAT_SETTINGS.
    • Остались ключевые: модульность server.ts ([COMP-001]), единый маппинг расширений ([DUP-004]), консолидация тест-хелперов ([COMP-003]).
    • Готов обновить LEVER.md и/или перейти к реализации выбранного пункта.