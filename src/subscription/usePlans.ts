import { useGetList } from 'react-admin';
import type { PlanRow } from './SubscriptionContext';

// Тарифы меняются крайне редко (правятся миграцией, backend.md «Редактирование планов из
// админки в v1 не делаем»), а витрина нужна сразу нескольким компонентам одного экрана —
// держим ответ свежим подольше, как REFERENCE_STALE_TIME в реестре результатов тестов.
const PLANS_STALE_TIME = 5 * 60 * 1000;

// Витрина тарифов (GET /plans) — переиспользуется реестром подписок (фильтр по тарифу,
// колонки лимитов, диалоги «Продлить»/«Изменить») и экраном «Тариф». Через useGetList,
// а не собственный useEffect-загрузчик: на экране «Подписки» хук вызывается из четырёх
// мест сразу, и react-query схлопывает их в один сетевой запрос (плюс кэш между заходами).
// Маппинг ресурса на путь — в dataProvider (ветка resource === 'plans').
export const usePlans = (): { plans: PlanRow[]; loading: boolean } => {
  const { data, isPending } = useGetList<PlanRow & { id: string }>(
    'plans',
    { pagination: { page: 1, perPage: 100 }, sort: { field: 'sort_order', order: 'ASC' } },
    { staleTime: PLANS_STALE_TIME },
  );
  return { plans: data ?? [], loading: isPending };
};
