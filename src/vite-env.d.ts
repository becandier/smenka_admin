/// <reference types="vite/client" />

// Глобальный неймспейс Яндекс.Карт (2.1) появляется после ленивой загрузки скрипта.
// У JS API нет официальных типов — описываем как опциональный any, чтобы не тянуть пакет типов.
interface Window {
  ymaps?: any;
}

declare module 'ra-language-russian' {
  import type { TranslationMessages } from 'react-admin';
  const russianMessages: TranslationMessages;
  export default russianMessages;
}
