import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @mui/icons-material исключён из dep-оптимизации: иначе deep-импорты иконок внутри
// пред-оптимизированного react-admin (напр. SidebarToggleButton → `@mui/icons-material/Menu`)
// интероп-ятся как `{default}`-объекты и React падает «Element type is invalid».
// Прод-сборка (rollup) этим не страдает.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 5173 },
  resolve: {
    dedupe: ['react', 'react-dom', '@mui/material', '@mui/icons-material', '@mui/system'],
  },
  optimizeDeps: {
    exclude: ['@mui/icons-material'],
  },
});
