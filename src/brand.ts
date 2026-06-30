// Smenka Brand Kit v1.0 — канонические токены.
// Источник правды: docs/tasks/rebranding/brand_contract.md + smenka-brand-kit/colors/tokens.json.
// HEX байт-в-байт из бренд-контракта; менять только синхронно с контрактом.

export const brand = {
  blue: '#4A90D9', // primary · Smenka Blue
  blueDeep: '#1B4E7A', // accent / pressed · Deep Blue
  blueMid: '#2E6DB0', // link / hover · Blue Mid
  bluePale: '#9CC4EA', // soft · Pale Blue
  ink: '#1D2530', // text
  muted: '#6B7785', // secondary text
  line: '#E7EBF0', // borders
  wash: '#EAF2FB', // blue fill background
  paper: '#FFFFFF', // surface
} as const;

// Тинты синего (primary, смешанный с белым) — фоны, состояния, графики. Без градиентов.
export const blueTints = {
  95: '#5396DB',
  80: '#6EA6E1',
  65: '#89B7E6',
  50: '#A5C8EC',
  35: '#C0D8F2',
  20: '#DBE9F7',
  10: '#EDF4FB',
} as const;

// Палитра для графиков (recharts): от насыщенного синего к мягким тинтам.
// Циклится по модулю, когда категорий больше, чем оттенков.
export const chartPalette = [
  brand.blue,
  blueTints[95],
  blueTints[80],
  blueTints[65],
  blueTints[50],
  blueTints[35],
] as const;

// Типографика бренда — Swiss grotesque, системный стек (без файлов шрифтов).
export const fontFamilySans = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
export const fontFamilyMono = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
