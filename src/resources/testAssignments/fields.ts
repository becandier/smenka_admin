import type { RaRecord } from 'react-admin';
import { formatDateTime, pluralizeAssignments, pluralizeAttempts } from '../../utils/format';

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

// --- Снятие назначения (test_assignment_unassign): тексты подтверждения ---
// Вынесены из UnassignDialog.tsx (react-refresh/only-export-components: файл с компонентами
// не может параллельно экспортировать обычные функции) — общие для реестра «Результаты
// тестов» (testAssignments/index.tsx) и диалога управления назначениями теста
// (testTemplates/AssignDialog.tsx).
export interface ConfirmParts {
  title: string;
  body: string;
}

// Текст подтверждения снятия одного назначения (admin.md, «Диалог подтверждения»).
// templateTitleText передаётся явно, а не читается из record.template: элементы
// GET .../test-templates/{id}/assignments (AssignDialog) не денормализуют template — в
// отличие от реестра GET .../test-assignments, где он есть в каждой строке.
export const singleUnassignConfirmParts = (
  templateTitleText: string,
  record: RaRecord,
): ConfirmParts => {
  const title = `Снять тест «${templateTitleText}» с сотрудника ${memberDisplayName(record)}?`;
  const used = Number(record.attempts_used ?? 0);
  if (used <= 0) {
    return { title, body: 'Назначение будет удалено.' };
  }
  return {
    title,
    body: `Будут безвозвратно удалены назначение и все результаты сотрудника по этому тесту (${used} ${pluralizeAttempts(used)}, лучший результат ${bestPercent(record)}). Восстановить их будет нельзя.`,
  };
};

// Сводка для массового снятия (admin.md, «Массовое снятие»): сколько назначений выбрано и
// сколько из них с результатами (attempts_used > 0) — те удалятся безвозвратно вместе с
// попытками. Выбранные назначения могут относиться к разным тестам — названием теста сводку
// не уточняем.
export const bulkUnassignConfirmParts = (total: number, withResults: number): ConfirmParts => {
  const title = `Снять ${total} ${pluralizeAssignments(total)}?`;
  if (withResults <= 0) {
    return { title, body: 'Выбранные назначения будут удалены.' };
  }
  return {
    title,
    body: `Будут безвозвратно удалены сами назначения и результаты сотрудников — у ${withResults} из ${total} есть сданные попытки. Восстановить их будет нельзя.`,
  };
};
