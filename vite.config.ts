import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @mui/icons-material@5 в корне пакета — CommonJS, и deep-импорты иконок
// (`@mui/icons-material/AccountCircle` — так их импортирует и react-admin, и наш src)
// в dev-режиме ломают esbuild-интероп: страница падает с
// «does not provide an export named 'default'» / «Element type is invalid» (белый экран).
// Алиас направляет все deep-импорты в ESM-сборку пакета (esm/*) — без интеропа вовсе.
// Прод-сборка (rollup) работает и без алиаса, но с ним dev и prod резолвят одинаково.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 5173 },
  resolve: {
    alias: [
      {
        find: /^@mui\/icons-material\/(?!esm\/)(.+)$/,
        replacement: '@mui/icons-material/esm/$1',
      },
    ],
  },
});
