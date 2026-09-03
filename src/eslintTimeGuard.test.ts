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
    'flags both toLocaleString-family and Intl.DateTimeFormat for a regular src file',
    async () => {
      const config = await eslint.calculateConfigForFile('src/resources/orgShifts.tsx');
      const rule = config.rules?.['no-restricted-syntax'];
      expect(selectorContains(rule, 'toLocaleDateString')).toBe(true);
      expect(selectorContains(rule, 'Intl')).toBe(true);
    },
    PROJECT_SERVICE_WARMUP_TIMEOUT,
  );

  it('exempts src/utils/time.ts entirely — the single formatting entry point', async () => {
    const config = await eslint.calculateConfigForFile('src/utils/time.ts');
    expect(config.rules?.['no-restricted-syntax']).toBeUndefined();
  });

  it.each(['src/utils/format.ts', 'src/utils/files.ts'])(
    'exempts %s from toLocaleString (numeric formatting) but still forbids Intl.DateTimeFormat',
    async (filePath) => {
      const config = await eslint.calculateConfigForFile(filePath);
      const rule = config.rules?.['no-restricted-syntax'];
      expect(selectorContains(rule, 'toLocaleDateString')).toBe(false);
      expect(selectorContains(rule, 'Intl')).toBe(true);
    },
  );
});
