// Единое правило отображения имени сотрудника (member_display_name/admin.md).
//
// По умолчанию (везде, кроме «Зарплаты»): основная строка — display_name (если задан),
// иначе настоящее user_name; подпись — user_name, но только если display_name задан и
// отличается (иначе это дубль и подпись не нужна).
//
// Раздел «Зарплата» (options.reversed) — приоритет обратный (это денежный документ):
// основная строка всегда настоящее user_name, подпись — display_name (если задан и
// отличается).
//
// Настоящее имя нигде не должно полностью исчезать из интерфейса — правило гарантирует
// это в обоих режимах: user_name либо основная строка, либо подпись.

export interface MemberNameSource {
  user_name?: string | null;
  display_name?: string | null;
}

export interface MemberNameParts {
  primary: string;
  secondary: string | null;
}

const FALLBACK_NAME = '—';

// Нормализация display_name: обрезаем пробелы по краям; пустая строка/только пробелы → null
// (тот же смысл, что «сбросить на настоящее имя» — см. backend.md нормализацию записи).
export const normalizeDisplayName = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const realNameOf = (source: MemberNameSource): string => {
  const trimmed = typeof source.user_name === 'string' ? source.user_name.trim() : '';
  return trimmed === '' ? FALLBACK_NAME : trimmed;
};

export const getMemberNameParts = (
  source: MemberNameSource,
  options?: { reversed?: boolean },
): MemberNameParts => {
  const realName = realNameOf(source);
  const displayName = normalizeDisplayName(source.display_name);

  if (options?.reversed) {
    const secondary = displayName && displayName !== realName ? displayName : null;
    return { primary: realName, secondary };
  }

  if (!displayName || displayName === realName) {
    return { primary: realName, secondary: null };
  }
  return { primary: displayName, secondary: realName };
};

// Плоская строка «Основное · Подпись» — для мест, где нельзя отрендерить два React-узла
// (заголовки-InfoRow внутри чужой Typography, recharts-подписи осей и т.п.). Разделитель
// «·» — тот же приём, что workLocationLabel в orgShifts.tsx/checklistInstances.tsx.
export const formatMemberNameFlat = (
  source: MemberNameSource,
  options?: { reversed?: boolean },
): string => {
  const { primary, secondary } = getMemberNameParts(source, options);
  return secondary ? `${primary} · ${secondary}` : primary;
};

// Строка для поиска по подстроке (MemberSelectFilter): должна находить и по имени в
// организации, и по настоящему.
export const memberSearchHaystack = (source: MemberNameSource): string =>
  [source.display_name, source.user_name]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join(' ')
    .toLowerCase();
