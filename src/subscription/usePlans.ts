import { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import type { PlanRow } from './SubscriptionContext';

// Витрина тарифов (GET /plans) — переиспользуется реестром подписок (фильтр по тарифу,
// диалоги «Продлить»/«Изменить») и экраном «Тариф». Отдельный хук вместо getList('plans')
// в dataProvider — ресурс не участвует в стандартном react-admin CRUD (нет create/edit/show),
// только витрина для чтения в нескольких местах.
export const usePlans = (): { plans: PlanRow[]; loading: boolean } => {
  const dataProvider = useDataProvider();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    dataProvider
      .getPlans()
      .then((res: PlanRow[]) => {
        if (active) setPlans(res);
      })
      .catch(() => {
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataProvider]);

  return { plans, loading };
};
