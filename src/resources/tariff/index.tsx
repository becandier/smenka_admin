import { useEffect, useState } from 'react';
import { Title, useDataProvider, usePermissions } from 'react-admin';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { SUPPORT_CONTACT } from '../../config';
import { useCurrentOrg } from '../../orgContext';
import { useMyOrgRole } from '../../utils/useMyOrgRole';
import type { Permissions } from '../../providers/authProvider';
import type { OrgSubscription, PlanRow } from '../../subscription/SubscriptionContext';
import {
  daysLeftLabel,
  formatDate,
  formatMoneyMinor,
  planCodeLabel,
  subscriptionStatusLabel,
  tariffErrorMessage,
  SUBSCRIPTION_STATUS_COLOR,
} from '../../utils/format';

// Прогресс использования лимита (сотрудники/точки, admin.md «Использование»): линейный
// прогресс, при null-лимите — «без ограничений» без полосы; при usage>=limit — полоса
// красная и текст-подсказка про апгрейд (мягкий энфорсмент — «нет запрета», только апсейл).
const UsageRow = ({
  label,
  usage,
  limit,
  limitReachedHint,
}: {
  label: string;
  usage: number;
  limit: number | null;
  limitReachedHint: string;
}) => {
  const unlimited = limit === null;
  const reached = !unlimited && usage >= limit;
  const percent = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, (usage / limit) * 100);

  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {unlimited ? `${usage} · без ограничений` : `${usage} / ${limit}`}
        </Typography>
      </Stack>
      {!unlimited && (
        <LinearProgress
          variant="determinate"
          value={percent}
          color={reached ? 'error' : 'primary'}
          sx={{ height: 8, borderRadius: 1 }}
        />
      )}
      {reached && (
        <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
          {limitReachedHint}
        </Typography>
      )}
    </Box>
  );
};

// Сравнение тарифов (admin.md «Что входит в тариф»): цены и лимиты — только из GET /plans,
// в компоненте не хардкодятся ни разу (backend.md, «Приёмка»).
const PlanComparisonTable = ({ plans }: { plans: PlanRow[] }) => {
  if (plans.length === 0) return null;
  const limitCell = (n: number | null): string => (n === null ? 'Без ограничений' : String(n));
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Параметр</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {p.name}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Цена</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {formatMoneyMinor(p.price_minor)}/мес
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Сотрудников</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {limitCell(p.limits.max_employees)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Рабочих точек</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {limitCell(p.limits.max_locations)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Штрафы</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {p.features.fines ? '✓' : '—'}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell>Импорт теста из JSON / промпт для ИИ</TableCell>
            {plans.map((p) => (
              <TableCell key={p.code} align="center">
                {p.features.test_import ? '✓' : '—'}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
};

// Полноценный email требует непустую локальную часть до «@» и домен с точкой после —
// отличает реальный адрес от телеграм-хэндла вида «@smenka_support» (there's nothing
// before the «@», просто includes('@') ловил и его как email — code-review finding).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Блок «Как оплатить» (admin.md): контакт из VITE_SUPPORT_CONTACT, без хардкода. Пусто —
// блок не рендерится совсем (заглушки вида «скоро» не ставим). Владелец может подставить
// email, ссылку (https://…) или произвольный текст (телеграм-хэндл, телефон) — рендерим
// каждый по-своему, показывая как есть, только если распознали формат.
const HowToPayCard = () => {
  if (SUPPORT_CONTACT === '') return null;
  const isEmail = EMAIL_PATTERN.test(SUPPORT_CONTACT);
  const isUrl = /^https?:\/\//.test(SUPPORT_CONTACT);
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Как оплатить
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          Онлайн-оплаты пока нет — договоритесь об оплате напрямую, а мы проведём её в подписке
          вручную.
        </Typography>
        {isEmail ? (
          <MuiLink href={`mailto:${SUPPORT_CONTACT}`}>{SUPPORT_CONTACT}</MuiLink>
        ) : isUrl ? (
          <MuiLink href={SUPPORT_CONTACT} target="_blank" rel="noreferrer">
            {SUPPORT_CONTACT}
          </MuiLink>
        ) : (
          <Typography>{SUPPORT_CONTACT}</Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Экран «Тариф» кабинета организации (admin.md, «Экран «Тариф»»): текущий тариф, использование,
// сравнение тарифов, «Как оплатить». Доступ — owner/admin своей организации + super_admin
// (сквозной доступ, как и остальные org-экраны; backend не ограничивает эндпоинт
// GET .../subscription от super_admin — ensure_admin_or_owner(allow_super_admin=true)).
export const TariffPage = () => {
  const { org } = useCurrentOrg();
  const { permissions } = usePermissions<Permissions>();
  const role = useMyOrgRole();
  const dataProvider = useDataProvider();

  const isSuper = permissions?.role === 'super_admin';
  const canView = isSuper || role === 'owner' || role === 'admin';

  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orgId = org?.id ?? null;

  useEffect(() => {
    if (!orgId || !canView) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([dataProvider.getOrgSubscription(orgId), dataProvider.getPlans()])
      .then(([sub, planList]: [OrgSubscription, PlanRow[]]) => {
        if (!active) return;
        setSubscription(sub);
        setPlans(planList);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(tariffErrorMessage(e, 'Не удалось загрузить данные о тарифе'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId, canView, dataProvider]);

  if (!org) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Тариф" />
        <Typography color="text.secondary">Выберите организацию.</Typography>
      </Box>
    );
  }

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="Тариф" />
        <Typography color="text.secondary">
          Тариф организации доступен владельцу и администратору.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 720 }}>
      <Title title={`Тариф — ${org.name}`} />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Тариф
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !subscription && <CircularProgress />}

      {subscription && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap">
                <Typography variant="h6">{subscription.plan_name}</Typography>
                <Chip
                  size="small"
                  color={SUBSCRIPTION_STATUS_COLOR[subscription.status] ?? 'default'}
                  label={subscriptionStatusLabel(subscription.status)}
                />
              </Stack>
              <Typography color="text.secondary">
                {formatMoneyMinor(subscription.price_minor)}/мес
              </Typography>
              <Typography sx={{ mt: 1 }}>
                {subscription.status === 'active' || subscription.status === 'past_due'
                  ? `Оплачено до ${formatDate(subscription.current_period_end)}`
                  : subscription.status === 'trialing'
                    ? `Пробный период до ${formatDate(subscription.trial_ends_at)}`
                    : null}
              </Typography>
              <Typography color="text.secondary">
                {daysLeftLabel(subscription.days_left)}
              </Typography>
              {subscription.status === 'trialing' && (
                <Alert severity="info" sx={{ mt: 1.5 }} variant="outlined">
                  Пробный период — доступны все функции Премиума.
                </Alert>
              )}
              {subscription.status === 'past_due' && (
                <Alert severity="warning" sx={{ mt: 1.5 }} variant="outlined">
                  Доступ сохраняется до {formatDate(subscription.grace_ends_at)}.
                </Alert>
              )}
              {(subscription.status === 'suspended' || subscription.status === 'canceled') && (
                <Alert severity="error" sx={{ mt: 1.5 }} variant="outlined">
                  Организация переведена в режим только для чтения.
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Использование
              </Typography>
              <UsageRow
                label="Сотрудники"
                usage={subscription.usage.employees ?? 0}
                limit={subscription.limits.max_employees}
                limitReachedHint={`Добавить нового сотрудника можно на тарифе ${planCodeLabel('premium')}`}
              />
              <UsageRow
                label="Рабочие точки"
                usage={subscription.usage.locations ?? 0}
                limit={subscription.limits.max_locations}
                limitReachedHint={`Добавить новую точку можно на тарифе ${planCodeLabel('premium')}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Что входит в тариф
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <PlanComparisonTable plans={plans} />
            </CardContent>
          </Card>

          <HowToPayCard />
        </Stack>
      )}
    </Box>
  );
};
