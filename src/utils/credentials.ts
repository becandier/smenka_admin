// Валидация и генерация логина/пароля сотрудника, заводимого админом организации
// (admin_created_accounts/admin.md, «Создание сотрудника» и «Окно выдачи доступа»).
// Используется формой создания сотрудника (members.tsx) и диалогом сброса пароля
// (memberCredentials.tsx) — единый источник правил, синхронный с backend.md.

const LOGIN_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

// Формат логина (backend.md: `^[a-zA-Z0-9._-]{3,32}$`). Поле опционально — валидатор
// молчит на пустом значении, обязательность (логин ИЛИ email) проверяется отдельно
// на уровне формы.
export const validateLoginFormat = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' && LOGIN_PATTERN.test(value)
    ? undefined
    : 'Латиница, цифры и символы . _ -, от 3 до 32 символов';
};

// Пароль опционален; если введён вручную — те же правила, что при регистрации
// (backend.md, «POST .../members»): ≥8 символов, минимум одна буква и одна цифра.
export const validatePasswordFormat = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length < 8) return 'Не менее 8 символов';
  if (!/[A-Za-zА-Яа-яЁё]/.test(value) || !/\d/.test(value)) {
    return 'Минимум одна буква и одна цифра';
  }
  return undefined;
};

// Алфавит без визуально неоднозначных знаков (0/O/o, 1/l/I) — зеркалит серверную генерацию
// пароля по умолчанию (backend.md, «Бизнес-правила», п.5), чтобы клиентское превью кнопки
// «Сгенерировать» не отличалось по духу от того, что сервер выдаст, если оставить поле пустым.
const PASSWORD_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_DIGITS = '23456789';
const PASSWORD_LENGTH = 10;

// Пароль из этой кнопки может уйти на сервер как есть (если админ не поправит значение
// перед сабмитом) — Math.random() для него неуместен (предсказуем/не криптостойкий).
// crypto.getRandomValues доступен во всех целевых браузерах Vite-сборки. Rejection sampling
// убирает modulo-смещение края диапазона (256 % alphabet.length).
const secureRandomInt = (maxExclusive: number): number => {
  const limit = 256 - (256 % maxExclusive);
  const buf = new Uint8Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % maxExclusive;
};

const randomFrom = (alphabet: string): string => alphabet[secureRandomInt(alphabet.length)];

// Клиентское превью пароля: гарантированно ≥1 буква и ≥1 цифра (проходит
// validatePasswordFormat), остальные позиции — из общего алфавита, порядок перемешан.
export const generateClientPassword = (): string => {
  const alphabet = PASSWORD_LETTERS + PASSWORD_DIGITS;
  const chars = [randomFrom(PASSWORD_LETTERS), randomFrom(PASSWORD_DIGITS)];
  while (chars.length < PASSWORD_LENGTH) chars.push(randomFrom(alphabet));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

// Строка для «Скопировать» в окне выдачи доступа (admin.md, «логин+пароль одной строкой»).
export const formatCredentialsLine = (login: string | null, password: string | null): string =>
  `Логин: ${login ?? '—'} · Пароль: ${password ?? '—'}`;
