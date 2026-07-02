import { useEffect, useRef, useState } from 'react';
import { LoginForm, useLogin, useNotify } from 'react-admin';
import { Box, Card, CardContent, Divider, Stack } from '@mui/material';
import AppleIcon from '@mui/icons-material/Apple';
import { brand } from '../brand';
import { getOauthConfig, type OauthConfig } from '../providers/authProvider';
import { useAsync } from '../utils/useAsync';

// Скрипты грузим лениво и по одному разу на приложение (см. useYandexMaps.ts — тот же паттерн:
// module-level промис, устойчиво к повторному входу на страницу и двойному маунту StrictMode).
const scriptPromises = new Map<string, Promise<void>>();
const loadScript = (src: string): Promise<void> => {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error(`Не удалось загрузить ${src}`));
    };
    document.head.appendChild(el);
  });
  scriptPromises.set(src, promise);
  return promise;
};

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

// Брендированный экран входа: лок-ап по центру, фон wash, форма с primary-кнопкой +
// опциональные Google/Apple (oauth_login). LoginForm берёт useLogin → authProvider как раньше;
// OAuth-ветки идут через тот же useLogin (login({oauthProvider: ...})) — редирект/инвалидация
// кэша permissions после входа отрабатывают одинаково для пароля и OAuth.
export const LoginPage = () => {
  const login = useLogin();
  const notify = useNotify();
  // loading (конфиг): пока ответ не пришёл — кнопки не рендерим вовсе (не мигаем disabled→enabled).
  // Ошибка запроса ведёт себя так же, как «ещё грузится» (data остаётся null) — кнопки просто
  // не появляются, без отдельного тоста: это совпадает с духом ТЗ («фронты обязаны скрывать
  // кнопку», а не показывать её с последующей ошибкой при клике).
  const { data: config } = useAsync<OauthConfig>(getOauthConfig, []);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  // Nonce, сгенерированный при AppleID.auth.init — сверяется с state в ответе signIn()
  // (защита от подмены/replay ответа попапа; см. handleAppleClick).
  const appleStateRef = useRef<string | null>(null);

  const google = config?.google?.enabled && config.google.client_id ? config.google : null;
  const apple = config?.apple?.enabled && config.apple.client_id ? config.apple : null;

  useEffect(() => {
    if (!google) return;
    let cancelled = false;
    loadScript(GOOGLE_SCRIPT_SRC)
      .then(() => {
        if (cancelled || !window.google || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: google.client_id,
          callback: (response: { credential: string }) => {
            setSubmitting(true);
            login({ oauthProvider: 'google', idToken: response.credential })
              .catch((error: any) => {
                notify(error?.message ?? 'Не удалось войти через Google', { type: 'error' });
              })
              .finally(() => setSubmitting(false));
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 312,
          locale: 'ru',
        });
      })
      .catch(() => notify('Не удалось загрузить вход через Google', { type: 'warning' }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google?.client_id]);

  useEffect(() => {
    if (!apple) return;
    let cancelled = false;
    setAppleReady(false);
    loadScript(APPLE_SCRIPT_SRC)
      .then(() => {
        if (cancelled || !window.AppleID) return;
        const state = crypto.randomUUID();
        appleStateRef.current = state;
        window.AppleID.auth.init({
          clientId: apple.client_id,
          scope: 'name email',
          redirectURI: window.location.origin,
          state,
          usePopup: true,
        });
        setAppleReady(true);
      })
      .catch(() => notify('Не удалось загрузить вход через Apple', { type: 'warning' }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apple?.client_id]);

  const handleAppleClick = async (): Promise<void> => {
    if (!window.AppleID || !appleReady) return;
    setSubmitting(true);
    try {
      const result = await window.AppleID.auth.signIn();
      // Сверяем state с тем, что передали в init — защита от подмены/replay ответа попапа.
      if (result?.state && result.state !== appleStateRef.current) {
        throw new Error('Не удалось войти через Apple: несовпадение state');
      }
      const idToken = result?.authorization?.id_token;
      if (!idToken) throw new Error('Apple не вернул токен');
      // user приходит только при первой авторизации — дальше передавать нечего (см. backend.md).
      const name = result?.user?.name
        ? [result.user.name.firstName, result.user.name.lastName].filter(Boolean).join(' ')
        : undefined;
      await login({
        oauthProvider: 'apple',
        identityToken: idToken,
        email: result?.user?.email,
        name: name || undefined,
      });
    } catch (error: any) {
      // Пользователь закрыл попап — не считается ошибкой, ничего не показываем.
      if (error?.error === 'popup_closed_by_user') return;
      notify(error?.message ?? 'Не удалось войти через Apple', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const showOauth = Boolean(google || apple);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: brand.wash,
        p: 2,
      }}
    >
      <Box
        component="img"
        src="/smenka-lockup-color.svg"
        alt="Smenka"
        sx={{ width: 220, maxWidth: '70%', mb: 3 }}
      />
      <Card sx={{ width: '100%', maxWidth: 360 }}>
        <CardContent
          sx={{
            opacity: submitting ? 0.6 : 1,
            pointerEvents: submitting ? 'none' : 'auto',
          }}
        >
          <LoginForm />
          {showOauth && (
            <>
              <Divider sx={{ my: 2 }}>или</Divider>
              <Stack spacing={1.5}>
                {google && (
                  <Box ref={googleButtonRef} sx={{ display: 'flex', justifyContent: 'center' }} />
                )}
                {apple && (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => void handleAppleClick()}
                    disabled={submitting || !appleReady}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      width: '100%',
                      height: 40,
                      border: 'none',
                      borderRadius: 1,
                      bgcolor: '#000',
                      color: '#fff',
                      fontFamily: 'inherit',
                      fontSize: '0.9375rem',
                      fontWeight: 500,
                      cursor: submitting || !appleReady ? 'default' : 'pointer',
                      '&:hover': { bgcolor: submitting || !appleReady ? '#000' : '#1a1a1a' },
                    }}
                  >
                    <AppleIcon fontSize="small" />
                    Войти через Apple
                  </Box>
                )}
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
