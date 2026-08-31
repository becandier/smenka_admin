import { useCallback, useEffect, useState } from 'react';
import { Title, useDataProvider, useNotify, usePermissions } from 'react-admin';
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
import type {
  BillingCheckoutRequest,
  BillingConfig,
  BillingOptions,
  PaymentRow,
} from '../../subscription/billingTypes';
import {
  billingErrorMessage,
  daysLeftLabel,
  formatDate,
  formatMoneyMinor,
  paymentPurposeLabel,
  planCodeLabel,
  subscriptionStatusLabel,
  tariffErrorMessage,
  SUBSCRIPTION_STATUS_COLOR,
} from '../../utils/format';
import { BillingExtendCards, BillingUpgradeCard } from './BillingSection';
import { PaymentHistoryTable } from './PaymentHistoryTable';
import { PaymentReturnBanner } from './PaymentReturnBanner';
import { usePaymentReturn } from './usePaymentReturn';

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
  // Оплатить продление/апгрейд может только фактический owner/admin организации — backend.md
  // фиксирует авторизацию всех billing/*-эндпоинтов буквально как «org_owner / org_admin»,
  // без сквозного доступа super_admin (в отличие от GET .../subscription, где он явно есть).
  // Расхождение с таблицей RBAC admin.md («История платежей организации» — да у super_admin)
  // разобрано в STATUS.md, «Открытые вопросы к аналитику»: super_admin получает то же самое
  // через реестр «Платежи» с фильтром по организации.
  const canPay = role === 'owner' || role === 'admin';

  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [billingOptions, setBillingOptions] = useState<BillingOptions | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const notify = useNotify();

  useEffect(() => {
    if (!orgId || !canView) return;
    let active = true;
    // Сброс подписки предыдущей организации: без этого при смене orgId спиннер
    // (`loading && !subscription`) гасится по старым данным, а неудачный запрос по новой
    // организации оставляет на экране чужой тариф/цену/лимиты рядом с ошибкой.
    setSubscription(null);
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

  // Состояние платёжного модуля (backend.md п.1, «GET /billing/config»): authenticated,
  // доступно и super_admin (бейдж тестового режима «показывается всем, кто видит экран»,
  // admin.md) — гейтится только canView, не canPay.
  useEffect(() => {
    if (!canView) return undefined;
    let active = true;
    dataProvider
      .getBillingConfig()
      .then((cfg: BillingConfig) => {
        if (active) setBillingConfig(cfg);
      })
      .catch(() => {
        // Fail-open по духу остального экрана (admin.md, «Состояния»): без конфигурации
        // платёжные блоки просто не показываются, информационная часть экрана не ломается.
        if (active) setBillingConfig(null);
      });
    return () => {
      active = false;
    };
  }, [canView, dataProvider]);

  const billingEnabled = billingConfig?.enabled ?? false;

  // Витрина «что и почём» (backend.md п.2) — только когда её реально можно показать: org
  // выбрана, роль позволяет платить, фича включена. Вынесена в useCallback — переиспользуется
  // и стартовым эффектом ниже, и обработчиком успешной оплаты (сумма/апгрейд могли измениться).
  const loadBillingOptions = useCallback(async (): Promise<void> => {
    if (!orgId || !canPay || !billingEnabled) {
      setBillingOptions(null);
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    try {
      const opts = await dataProvider.getBillingOptions(orgId);
      setBillingOptions(opts);
    } catch (e) {
      setBillingError(billingErrorMessage(e, 'Не удалось загрузить варианты оплаты'));
    } finally {
      setBillingLoading(false);
    }
  }, [orgId, canPay, billingEnabled, dataProvider]);

  useEffect(() => {
    void loadBillingOptions();
  }, [loadBillingOptions]);

  // Возврат с оплаты (admin.md, «Возврат с оплаты» — поллинг 2с/60с, четыре исхода):
  // canPay-гейт здесь же — у billing/payments/{id} та же авторизация org_owner/org_admin
  // (backend.md п.5), стрелять запросом от лица super_admin/employee бессмысленно.
  const handlePaymentSucceeded = useCallback(
    (payment: PaymentRow) => {
      if (!orgId) return;
      void (async () => {
        try {
          const sub = await dataProvider.getOrgSubscription(orgId);
          setSubscription(sub);
          notify(
            sub.current_period_end
              ? `Оплата прошла, тариф продлён до ${formatDate(sub.current_period_end)}`
              : 'Оплата прошла, тариф продлён',
            { type: 'success' },
          );
        } catch {
          // Платёж уже применён на бэке (иначе onSucceeded не сработал бы) — сбой здесь
          // только у обновления самой карточки, не у факта продления. Используем уже
          // известные из поллинга поля платежа, раз свежую подписку подтянуть не удалось.
          notify(
            `Оплата прошла: ${paymentPurposeLabel(payment)}. Обновите страницу, чтобы увидеть новый срок`,
            { type: 'success' },
          );
        }
        void loadBillingOptions();
        setHistoryRefreshToken((t) => t + 1);
      })();
    },
    [orgId, dataProvider, notify, loadBillingOptions],
  );

  const paymentReturn = usePaymentReturn(canPay ? orgId : null, handlePaymentSucceeded);

  // Создать платёж и увести браузер на confirmation_url (admin.md: «Никаких платёжных форм…
  // на нашей стороне» — редирект, а не встроенный виджет). checkoutBusy не сбрасывается при
  // успехе намеренно: страница в этот момент уже уходит на ЮKassa.
  const handleCheckout = useCallback(
    (body: BillingCheckoutRequest) => {
      if (!orgId) return;
      setCheckoutBusy(true);
      setCheckoutError(null);
      void (async () => {
        try {
          const result = await dataProvider.createBillingCheckout(orgId, body);
          window.location.href = result.confirmation_url;
        } catch (e) {
          setCheckoutError(billingErrorMessage(e, 'Не удалось создать платёж'));
          setCheckoutBusy(false);
        }
      })();
    },
    [orgId, dataProvider],
  );

  // «Повторить» на canceled-баннере (admin.md, «Возврат с оплаты», исход 3) — те же
  // параметры, что были в отменённом платеже (последний опрошенный PaymentRow).
  const handleRetryCheckout = useCallback(() => {
    const last = paymentReturn.payment;
    if (!last) return;
    handleCheckout(
      last.kind === 'upgrade'
        ? { kind: 'upgrade', plan_code: last.plan_code }
        : { kind: 'extend', plan_code: last.plan_code, months: last.months ?? 1 },
    );
  }, [paymentReturn.payment, handleCheckout]);

  const showPaymentBlocks = canPay && billingEnabled;

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

      {/* Бейдж тестового режима (admin.md, «Бейдж тестового режима»): «показывается всем,
          кто видит экран» — гейт по canView (уже пройден выше), не по canPay, иначе
          super_admin не увидел бы предупреждение над недоступным ему блоком продления. */}
      {billingEnabled && billingConfig?.mode === 'test' && (
        <Alert severity="warning" variant="filled" sx={{ mb: 2 }}>
          Тестовый режим оплаты — платежи ненастоящие
        </Alert>
      )}

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
                  ? // current_period_end пуст по умолчанию у организаций, ни разу не плативших
                    // (истёкший триал без оплаты) — тот же фолбэк на trial_ends_at, что и в
                    // SubscriptionBanner.tsx, иначе строка врёт «Оплачено до —».
                    `Оплачено до ${formatDate(subscription.current_period_end ?? subscription.trial_ends_at)}`
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

          {/* Онлайн-оплата (online_payments/admin.md): «Появляется под карточкой текущего
              тарифа» — продление, апгрейд, возврат с оплаты и история сразу под карточкой
              выше, до «Использования»/«Что входит в тариф». Только owner/admin при включённой
              фиче (backend.md, «GET /billing/config», «Блокировка при выключенной фиче»). */}
          {showPaymentBlocks && (
            <>
              <PaymentReturnBanner state={paymentReturn} onRetryCheckout={handleRetryCheckout} />

              {billingError && (
                <Alert severity="error" sx={{ mb: -1 }}>
                  {billingError}
                </Alert>
              )}
              {billingLoading && !billingOptions && <CircularProgress size={24} />}

              {billingOptions && (
                <>
                  <BillingExtendCards
                    options={billingOptions}
                    disabled={checkoutBusy || paymentReturn.blocksNewCheckout}
                    onSelect={(planCode, months) =>
                      handleCheckout({ kind: 'extend', plan_code: planCode, months })
                    }
                  />
                  <BillingUpgradeCard
                    options={billingOptions}
                    disabled={checkoutBusy || paymentReturn.blocksNewCheckout}
                    onSelect={(planCode) =>
                      handleCheckout({ kind: 'upgrade', plan_code: planCode })
                    }
                  />
                </>
              )}

              {checkoutError && <Alert severity="error">{checkoutError}</Alert>}

              {orgId && <PaymentHistoryTable orgId={orgId} refreshToken={historyRefreshToken} />}
            </>
          )}

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

          {/* «Как оплатить» (контакт вне сервиса) теряет смысл, когда для этой организации
              уже работает онлайн-оплата — иначе рядом с рабочими кнопками «Оплатить» висел бы
              текст «Онлайн-оплаты пока нет», который стал неверным именно этой фичей. */}
          {!showPaymentBlocks && <HowToPayCard />}
        </Stack>
      )}
    </Box>
  );
};
