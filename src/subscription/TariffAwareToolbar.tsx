import type { ReactNode } from 'react';
import { SaveButton, Toolbar } from 'react-admin';
import { FeatureLockButton } from './FeatureLock';
import { useHasFeature, useIsReadOnly, type PlanFeatures } from './SubscriptionContext';
import { useSectionReadOnly } from '../utils/useOrgAccess';

// Тулбар формы (Edit/Create), учитывающий тариф и read-only (admin.md, «Гейтинг функций
// тарифа» + «Read-only режим»): порядок проверок — сначала read-only (весь тулбар
// скрывается, включая переданные через children кнопки вроде DeleteButton — в read-only
// нет ни сохранения, ни удаления), затем, если передан `feature`, доступность конкретной
// платной функции (Save дизейблится замком, клик — диалог «Доступно на Премиуме»).
// Без `feature` — обычный тулбар, только с read-only-гейтингом. `section` (access_profiles) —
// тулбар скрывается и без права «управление» на раздел (форма открыта на просмотр).
export const TariffAwareToolbar = ({
  feature,
  featureLabel,
  section,
  children,
}: {
  feature?: keyof PlanFeatures;
  featureLabel?: string;
  section?: string;
  children?: ReactNode;
}) => {
  // Без section — только read-only подписки, как раньше (useSectionReadOnly с пустым
  // разделом не годится: can('') = false у не-полного админа).
  const sectionReadOnly = useSectionReadOnly(section ?? '');
  const subscriptionReadOnly = useIsReadOnly();
  const isReadOnly = section ? sectionReadOnly : subscriptionReadOnly;
  // Хук вызывается безусловно (иначе нарушение rules-of-hooks между ветками) — при
  // отсутствии `feature` его результат просто не используется.
  const hasFeature = useHasFeature(feature ?? 'fines');

  if (isReadOnly) return null;

  if (feature && !hasFeature) {
    return (
      <Toolbar>
        <FeatureLockButton locked featureLabel={featureLabel ?? 'Эта функция'} raIcon>
          <SaveButton />
        </FeatureLockButton>
      </Toolbar>
    );
  }

  return (
    <Toolbar>
      <SaveButton />
      {children}
    </Toolbar>
  );
};
