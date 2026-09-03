import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Регрессионный тест на находку повторного ревью: во flat config два объекта, которые
// матчат одни и те же файлы и задают одноимённое правило (`no-restricted-syntax`), не
// складываются — второй полностью замещает первый. В f2add6f это стирало запрет на
// toLocaleString-семейство, оставляя только Intl.DateTimeFormat, и `npm run lint`
// переставал ловить прямые вызовы `toLocaleDateString` вне src/utils/time.ts.
//
// Тест проверяет ЭФФЕКТИВНЫЙ конфиг (после слияния flat-config-объектов) — то же самое,
// что делает `eslint --print-config`, — а не поведение правила на реальном коде: для
// типизированного (projectService) AST-лита потребовался бы физический файл, включённый
// в tsconfig, что усложнило бы тест без дополнительной пользы — сам регресс был в
// эффективной конфигурации правила, а не в его логике.

interface SelectorEntry {
  selector: string;
}

const isSelectorEntry = (value: unknown): value is SelectorEntry =>
  typeof value === 'object' && value !== null && 'selector' in value && typeof value.selector === 'string';

const selectorContains = (ruleConfig: unknown, needle: string): boolean =>
  Array.isArray(ruleConfig) &&
  ruleConfig.some((entry) => isSelectorEntry(entry) && entry.selector.includes(needle));

// ESLint нормализует severity flat-конфига ('error'/'warn'/'off') в число (2/1/0) уже
// в calculateConfigForFile — проверяем именно эту нормализованную форму. Регресс,
// пойманный повторным ревью: понижение 'error' → 'warn' в eslint.config.js оставляло
// селекторы на месте (эта проверка проходила), но `npm run lint` переставал падать
// на реальном нарушении (exit 0, warning вместо error) — тест обязан ловить и severity,
// не только состав селекторов.
const ERROR_SEVERITY = 2;

const ruleSeverity = (ruleConfig: unknown): unknown => (Array.isArray(ruleConfig) ? ruleConfig[0] : undefined);

// typescript-eslint инициализирует TS project service (полный анализ src) на первый вызов
// calculateConfigForFile — это разовая дорогая операция (десятки секунд на CI), кэшируемая
// дальше на уровень процесса. Один общий ESLint-инстанс + увеличенный таймаут на первый тест.
// Без явного cwd — ESLint сам берёт process.cwd() (корень проекта, где лежит
// eslint.config.js); в тестовом файле Node-глобалы не типизированы (@types/node не
// подключён, проект — Vite/import.meta.env, а не Node).
const eslint = new ESLint();
const PROJECT_SERVICE_WARMUP_TIMEOUT = 60_000;

describe('eslint no-restricted-syntax time guard', () => {
  it(
    'flags both toLocaleString-family and Intl.DateTimeFormat for a regular src file, as an error',
    async () => {
      const config = await eslint.calculateConfigForFile('src/resources/orgShifts.tsx');
      const rule = config.rules?.['no-restricted-syntax'];
      expect(ruleSeverity(rule)).toBe(ERROR_SEVERITY);
      expect(selectorContains(rule, 'toLocaleString')).toBe(true);
      expect(selectorContains(rule, 'toLocaleDateString')).toBe(true);
      expect(selectorContains(rule, 'toLocaleTimeString')).toBe(true);
      expect(selectorContains(rule, 'Intl')).toBe(true);
    },
    PROJECT_SERVICE_WARMUP_TIMEOUT,
  );

  it('exempts src/utils/time.ts entirely — the single formatting entry point', async () => {
    const config = await eslint.calculateConfigForFile('src/utils/time.ts');
    expect(config.rules?.['no-restricted-syntax']).toBeUndefined();
  });

  // dates.ts не перечислен ни в одном исключении (см. комментарий в eslint.config.js) —
  // репрезентативный "обычный" файл вне format.ts/files.ts, который должен остаться под
  // полным запретом. Проверяем его отдельно от orgShifts.tsx, чтобы будущий узкий override
  // (третий объект с более конкретным glob, перекрывающий этот файл) сломал тест, а не
  // прошёл незамеченным.
  it('keeps the full guard (including bare toLocaleString) active for src/utils/dates.ts', async () => {
    const config = await eslint.calculateConfigForFile('src/utils/dates.ts');
    const rule = config.rules?.['no-restricted-syntax'];
    expect(ruleSeverity(rule)).toBe(ERROR_SEVERITY);
    expect(selectorContains(rule, 'toLocaleString')).toBe(true);
    expect(selectorContains(rule, 'toLocaleDateString')).toBe(true);
    expect(selectorContains(rule, 'Intl')).toBe(true);
  });

  it.each(['src/utils/format.ts', 'src/utils/files.ts'])(
    'exempts %s from bare toLocaleString (numeric formatting) but still forbids toLocaleDateString/toLocaleTimeString and Intl.DateTimeFormat, as an error',
    async (filePath) => {
      const config = await eslint.calculateConfigForFile(filePath);
      const rule = config.rules?.['no-restricted-syntax'];
      expect(ruleSeverity(rule)).toBe(ERROR_SEVERITY);
      expect(selectorContains(rule, 'toLocaleString')).toBe(false);
      expect(selectorContains(rule, 'toLocaleDateString')).toBe(true);
      expect(selectorContains(rule, 'toLocaleTimeString')).toBe(true);
      expect(selectorContains(rule, 'Intl')).toBe(true);
    },
  );
});
