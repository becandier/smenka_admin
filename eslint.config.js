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
  // Отключает стилистические правила, конфликтующие с Prettier. Держать последним.
  prettier,
);
