import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // API-слой пока нетипизирован (openapi отдаёт data: any), поэтому any/unsafe-семейство
      // выключено; включаем после типизации ответов бэка в dataProvider.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // async-обработчики в JSX-атрибутах (onClick={async ...}) — принятая практика React;
      // остальные проверки правила остаются включёнными.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Сброс состояния в начале фетч-эффекта — текущий паттерн загрузки данных;
      // включить при переходе на React Compiler / react-query-хуки.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Конфиг-файлы на чистом JS — без типовых правил (их нет в tsconfig).
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Временные API timestamp форматируются только через src/utils/time.ts. Исключение —
  // format.ts/files.ts: там toLocaleString используется только для чисел (деньги/размер
  // файла), не для Date, поэтому набор селектора отдельный от запрета на Intl.DateTimeFormat
  // ниже. dates.ts после миграции на time.ts больше не форматирует и не строит Intl напрямую,
  // поэтому в исключениях не перечислен — новый вызов там тоже будет отловлен.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/utils/time.ts', 'src/utils/format.ts', 'src/utils/files.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'], CallExpression[callee.property.name='toLocaleDateString'], CallExpression[callee.property.name='toLocaleTimeString']",
          message: 'Для отображения времени используйте src/utils/time.ts с явным TimeContext.',
        },
      ],
    },
  },
  // Intl.DateTimeFormat — единственная точка построения формата времени, только в time.ts.
  // Запрещаем и `new Intl.DateTimeFormat(...)`, и вызов без `new` (конструктор вызываемый).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/utils/time.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat'], CallExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message: 'Formatter времени создаётся только в src/utils/time.ts.',
        },
      ],
    },
  },
  // Отключает стилистические правила, конфликтующие с Prettier. Держать последним.
  prettier,
);
