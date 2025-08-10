## Руководство по использованию функций в шаблонах (.njs)

Ниже описаны доступные во время выполнения шаблонов функции и правила их использования: `partial`, `content`, `slot`, `chunkStart`, `chunkEnd`. Примеры основаны на коде репозитория и референсах из `grainjs` генераторов.

Важно:
- Код и комментарии в примерах — на английском языке (стандарт проекта).
- Вставки шаблонов отмечаются как `#{...}` (вывод в поток) и `<# ... #>`/`<#- ... -#>` (управляющие конструкции без/с пробелами).

### partial(obj, name)
Назначение: выполнить другой шаблон и вставить его результат в текущий вывод.

- Разрешение алиасов: если текущий шаблон объявил алиасы через директиву `requireAs`, они используются автоматически.
- Контекст: в качестве первого аргумента передаётся произвольный объект контекста для подключаемого шаблона.
- Возврат: строка; в режиме чанков возможно особое поведение (см. раздел «Чанки»).

Примеры:

```njs
<#@ requireAs ('codeblock.njs','codeblock') #>

// Insert rendered code from codeblock with provided context
#{partial(context.main, 'codeblock')}

// With a different data object
#{partial({ title: 'Hello' }, 'header.njs')}
```

### content(blockName, ctx?)
Назначение: выполнить именованный блок текущего шаблона (или родительского при `extend`).

- Если `ctx` опущен, внутри некоторых шаблонов по умолчанию подставляется локальный контекст (см. генерацию в `MainTemplate.*`).
- Если блок не найден, возвращается пустая строка.

Определение блока и вызов:

```njs
<# block 'view' : #>
<div>
  View block content
</div>
<# end #>

// Later in template
#{content('view', context)}
```

Пример реального использования (фрагмент):

```njs
import {
  #{content('import-from-react-admin')}
  #{slot('import-from-react-admin-show')}
} from 'react-admin'
```

### slot(name, content?)
Назначение: собрать и/или отрисовать имяованные вставки (слоты) внутри шаблона.

- Добавление содержимого в слот:
  - `slot('imports', 'React')`
  - `slot('imports', ['A', 'B'])`
- Отрисовка слота: `#{slot('imports')}`. На этапе компиляции это разворачивается в вызов частичного шаблона с именем слота и данными `context['imports'] || []`.

Примеры:

```njs
// Collect import names depending on conditions
<#- if (f.type === 'JSON') { -#>
  <#- slot('additional-imports', 'JSONField') #>
<#- } else { -#>
  <#- slot('additional-imports', 'TextField') #>
<#- } -#>

// Later: render collected imports list
import {
  #{content('base-imports')}
  #{slot('additional-imports')}
} from 'react-admin'
```

Поведение рантайма (из `TemplateFactoryBase.blockContent`):
- При вызове `slot(name, value)` значения аккумулируются без дублей.
- При вызове `slot(name)` возвращается строка вида `#{partial(context[name] || [], name)}` — это делегирует отрисовку соответствующему частичному шаблону с таким же именем.

### Чанки: chunkStart(name), chunkEnd()
Назначение: собрать многофайловый вывод в виде набора «чанков» (частей) с именами.

Активация: добавьте директиву в шаблон верхнего уровня.

```njs
<#@ chunks "$$$main$$$" #>
```

Правила работы (по `templates/MainTemplate.njs`):
- При активном `chunks` оболочка переопределяет `partial` так, что если частичный шаблон вернул массив чанков, они сливаются в общий результат, а в поток строки ничего не попадает.
- `chunkStart(name)` переключает текущий выходной буфер на чанк `name` и «закрывает» предыдущий.
- `chunkEnd()` завершает текущий чанк и возвращает запись к «основному».
- В конце шаблона собирается результат:
  - Массив `{ name: string, content: string | string[] }` по умолчанию.
  - Или хеш `{ [name]: string | string[] }` при `useHash`.
  - Опция `includeMainChunk` управляет включением главного чанка в результат.
  - Опция `deindent` применяет `options.applyDeindent` к содержимому чанков.

Минимальный пример многофайловой генерации:

```njs
<#@ chunks "$$$main$$$" #>

<#- chunkStart('src/index.js'); -#>
// entry
console.log('Hello');
<# chunkEnd(); -#>

<#- chunkStart('src/util.js'); -#>
export const sum = (a, b) => a + b
<# chunkEnd(); -#>
```

Пример из реальных шаблонов (генерация нескольких файлов на сущность):

```njs
<# const [ns, thingType] = context.thingType.split('.') #>

<#- chunkStart(`./${thingType}.js`); -#>
// main wrapper
<# chunkEnd(); -#>

<#- chunkStart(`./model/${thingType}.js`); -#>
// model
<# chunkEnd(); -#>

<#- chunkStart(`./store/${thingType}.js`); -#>
// store
<# chunkEnd(); -#>
```

### Взаимодействие partial и чанков
- Если вызываемый через `partial` шаблон сам работает в режиме чанков и возвращает массив чанков, переопределённый `partial` (в оболочке чанков) сольёт эти чанки в общий результат и вернёт пустую строку. Это ожидаемо — не рассчитывайте на строковый вывод от таких `partial` внутри чанкового контекста.
- Если частичный шаблон не использует чанки, `partial` вернёт строку для встраивания в текущий чанк.

Пример безопасного включения частичного шаблона в чанковом режиме:

```njs
// Will merge chunks if child returns chunk array; otherwise inserts string
#{partial(context.child, 'child-template')}
```

### Дополнительные примечания
- `options` (передаётся как пятый аргумент в `script`) доступен во всех шаблонах: `escapeIt`, `applyIndent`, `applyDeindent`, параметры sourcemap и т.д.
- Старайтесь не полагаться на лишние аргументы у `partial` — рантайм учитывает только `(obj, name)`, остальные игнорируются.
- Не дублируйте значения в одном и том же слоте: рантайм сам предотвращает дублирование.

### Частые паттерны
- Сбор импортов через слоты:

```njs
// Collect
<#- slot('import-from-react-admin-show','Show') #>
<#- slot('import-from-react-admin-show','EditButton') #>

// Render
import {
  #{slot('import-from-react-admin-show')}
} from 'react-admin'
```

- Условный выбор слота:

```njs
<#-
const type = (f.type == 'Number' ? 'Text' : f.type) + 'Field'
if (f.type === 'JSON') {
  slot('import-from-ra-ui-components-show', `${type}`)
} else {
  slot('import-from-react-admin-show', `${type}`)
}
-#>
```

---

Источники и ссылки на реализацию:
- Реализация `partial/content/slot` во время выполнения: `packages/fte.js-base/src/TemplateFactoryBase.ts` (`blockContent`).
- Логика чанков и переопределения `partial`: `packages/fte.js-templates/templates/MainTemplate.njs` (`blocks: chunks-start/chunks-finish`).
- Примеры реального использования: репозиторий `grainjs` (`apps/grainjs/generators` и `apps/grainjs/generators_new`).

## Объект `options` в шаблонах

Во всех сгенерированных функциях `script(context, _content, partial, slot, options)` доступен объект `options` с полезными функциями и полями (см. `packages/fte.js-base/src/types/DefaultFactoryOption.ts`, `DefaultFactoryOptions`).

Доступные функции:
- `escapeIt(text: string): string`
  - Экранирует спецсимволы в строке: `&`, `<`, `>`, `"` превращаются в HTML‑сущности.
  - Используется шаблоном `codeblock.njs` для варианта `uexpression` (экранированный вывод).
- `applyIndent(str: string | string[], indent: number | string): string | string[]`
  - Добавляет указанный отступ ко всем строкам. `indent` — число пробелов или строка‑префикс.
  - Применяется в `MainTemplate.*` для форматирования вставок и во многих примерах кода.
- `applyDeindent(str: string | string[], numChars: number | string): string | string[]`
  - Удаляет ведущие пробелы: вычисляет общий отступ по первой непустой строке (если `numChars` не 0), либо использует заданное число символов/строку для среза отступа.
  - Активно используется при директиве `deindent` и в сборке чанков.

Поля sourcemap (необязательные):
- `sourceMap?: boolean` — включить генерацию карт исходников.
- `inline?: boolean` — встроить карту как data‑URL; иначе наружный `.map` (при сборке).
- `sourceRoot?: string` — корень исходников для карт.
- `sourceFile?: string` — имя результирующего файла (используется в карте и `//# sourceMappingURL`).

Примеры использования:

```njs
// Escaped vs raw output
#{options.escapeIt(context.title)}
!{context.rawHtml}

// Indent a multi-line block by 2 spaces
#{options.applyIndent(content('view', context), '  ')}

// Deindent collected chunk content when returning
<#@ deindent #>
<#- chunkStart('file.txt'); -#>
Line 1
  Line 2
<# chunkEnd(); -#>
```

## Директивы `<#@ ... #>`

Ниже перечислены директивы, распознаваемые парсером (`packages/fte.js-parser/src/index.ts`) и используемые шаблонами. Для каждой приведены назначение, синтаксис и особенности.

### extend
- **Назначение**: задать родительский шаблон для наследования блоков.
- **Синтаксис**: `<#@ extend 'parent.njs' #>`
- **Поведение**: при компиляции вызывается `mergeParent(this.factory.ensure(parent))`; блочная модель позволяет переопределять блоки в дочернем шаблоне.

Пример:
```njs
<#@ extend 'layout.nhtml' #>
<# block 'content' : #>
Main content
<# end #>
```

### context
- **Назначение**: задать имя параметра контекста функции `script` и вложенных блоков/слотов.
- **Синтаксис**: `<#@ context 'ctx' #>`
- **Поведение**: влияет на сигнатуру `script(context, _content, partial, slot, options)` и на `function content(blockName, ctx)` внутри `MainTemplate.*`.

### alias
- **Назначение**: присвоить шаблону дополнительные имена для вызова через фабрику.
- **Синтаксис**: `<#@ alias 'name1' 'name2' #>` или многострочно.
- **Поведение**: фабрика регистрирует шаблон под всеми алиасами; доступен вызов по любому имени.

### requireAs
- **Назначение**: подключить зависимый шаблон и привязать к нему локальный алиас (для `partial`).
- **Синтаксис**: `<#@ requireAs ('path/to.tpl','localAlias') #>`
- **Поведение**: при компиляции выполняется `factory.ensure(path)` и создаётся `this.aliases[localAlias] = path`; `partial(obj, 'localAlias')` будет рендерить нужный шаблон.

Пример:
```njs
<#@ requireAs ('codeblock.njs','codeblock') #>
#{partial(context.main, 'codeblock')}
```

### deindent
- **Назначение**: удалить общий отступ у результирующих строк/чанков.
- **Синтаксис**: `<#@ deindent #>` или `<#@ deindent(2) #>`
- **Поведение**: `MainTemplate.*` при возврате результата вызывает `options.applyDeindent(...)` для строк и контента чанков.

### chunks
- **Назначение**: включить режим многофайловой генерации (чанки) и определить имя главного чанка.
- **Синтаксис**: `<#@ chunks '$$$main$$$' #>`
- **Поведение**: активирует `chunkStart/chunkEnd` и переопределение `partial` для слияния дочерних чанков. См. раздел «Чанки» выше.

Сопутствующие флаги:
- `includeMainChunk`: добавить основной чанк в результат (по умолчанию исключается)
- `useHash`: вернуть объект `{ [name]: content }` вместо массива `{ name, content }[]`

Пример:
```njs
<#@ chunks 'output.txt' #>
<#@ includeMainChunk #>
<#- chunkStart('part.txt'); -#>
content
<# chunkEnd(); -#>
```

### noContent, noSlots, noBlocks, noPartial, noOptions
- **Назначение**: флаги отключения соответствующих возможностей шаблона на уровне директив.
- **Синтаксис**: `<#@ noContent #>` и т.п.
- **Поведение**: парсер фиксирует флаги; актуальная генерация `MainTemplate.*` использует `noContent` для подавления вспомогательной функции `content(...)` в сгенерированном `script`. Остальные флаги зарезервированы и могут не влиять на генерацию в текущей версии.

### promise, callback
- **Назначение**: объявить ожидаемый способ возврата результата (обещание или колбэк).
- **Синтаксис**: `<#@ promise #>` / `<#@ callback #>`
- **Статус**: распознаётся парсером, но текущие шаблоны `MainTemplate.*` эти флаги не используют. В рантайме фабрика имеет `express()` для колбэк‑стиля.

### Прочие встречающиеся директивы
- `noEscape`, `noIndent`: встречаются в демо/исторических шаблонах. В текущей реализации парсера не имеют специальной обработки и, как правило, игнорируются. Для управления экранированием используйте `#{...}` (экранированное) и `!{...}` (без экранирования).

## Структурные теги (не директивы)

- `block`: объявление именованного блока
  - Синтаксис: `<# block 'name' : #> ... <# end #>`
- `slot` (блочный): объявление именованного слота как блока (используется генератором для формирования `slots`)
  - Синтаксис: `<# slot 'name' : #> ... <# end #>`
- `end`: завершение блочного/слотового раздела
