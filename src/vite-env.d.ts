/// <reference types="vite/client" />

// Глобальные неймспейсы сторонних SDK появляются после ленивой загрузки скрипта.
// У JS API нет официальных типов — описываем как опциональный any, чтобы не тянуть пакеты типов.
interface Window {
  ymaps?: any;
  google?: any; // Google Identity Services (oauth_login)
  AppleID?: any; // Sign in with Apple JS (oauth_login)
}

declare module 'ra-language-russian' {
  import type { TranslationMessages } from 'react-admin';
  const russianMessages: TranslationMessages;
  export default russianMessages;
}
