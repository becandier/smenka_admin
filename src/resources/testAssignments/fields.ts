import type { RaRecord } from 'react-admin';
import { formatDateTime } from '../../utils/format';

// Читатели полей TestAssignmentOut (backend.md) — общие для колонок реестра
// (testAssignments/index.tsx, FunctionField) и карточки деталей назначения
// (AssignmentDetailDialog.tsx), чтобы не дублировать одни и те же ternary-выражения.
export const templateTitle = (r: RaRecord): string =>
  (r.template as { title?: string } | undefined)?.title ?? '—';

export const memberDisplayName = (r: RaRecord): string =>
  (r.member as { display_name?: string } | undefined)?.display_name ?? '—';

export const bestPercent = (r: RaRecord): string =>
  typeof r.best_percent === 'number' ? `${r.best_percent}%` : '—';

export const attemptsUsed = (r: RaRecord): string =>
  `${r.attempts_used ?? 0} / ${r.max_attempts ?? '—'}`;

export const dueAt = (r: RaRecord): string => (r.due_at ? formatDateTime(String(r.due_at)) : '—');

export const lastAttemptAt = (r: RaRecord): string =>
  r.last_attempt_at ? formatDateTime(String(r.last_attempt_at)) : '—';
