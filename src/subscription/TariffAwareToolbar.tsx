import type { ReactNode } from 'react';
import { SaveButton, Toolbar } from 'react-admin';
import { FeatureLockButton } from './FeatureLock';
import { useHasFeature, useIsReadOnly, type PlanFeatures } from './SubscriptionContext';

// Тулбар формы (Edit/Create), учитывающий тариф и read-only (admin.md, «Гейтинг функций
// тарифа» + «Read-only режим»): порядок проверок — сначала read-only (весь тулбар
// скрывается, включая переданные через children кнопки вроде DeleteButton — в read-only
// нет ни сохранения, ни удаления), затем, если передан `feature`, доступность конкретной
// платной функции (Save дизейблится замком, клик — диалог «Доступно на Премиуме»).
// Без `feature` — обычный тулбар, только с read-only-гейтингом.
export const TariffAwareToolbar = ({
  feature,
  featureLabel,
  children,
}: {
  feature?: keyof PlanFeatures;
  featureLabel?: string;
  children?: ReactNode;
}) => {
  const isReadOnly = useIsReadOnly();
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
