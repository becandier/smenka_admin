import { useMemo } from 'react';
import { Button, Card, CardContent, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { formatDate, formatMoneyMinor, monthsLabel } from '../../utils/format';
import type { BillingExtendOption, BillingOptions } from '../../subscription/billingTypes';

interface PlanGroup {
  planCode: string;
  planName: string;
  options: BillingExtendOption[];
  // Месяцы варианта с наибольшей скидкой ВНУТРИ этой группы (admin.md: «Вариант с наибольшей
  // скидкой из доступных помечается как рекомендованный») — «выгода длинного периода» сравнивается
  // между периодами одного тарифа, поэтому у каждой карточки тарифа свой рекомендованный вариант,
  // а не один общий на весь блок. null — если ни у одного периода этого тарифа нет скидки.
  recommendedMonths: number | null;
}

// options.extend приходит уже сгруппированным по тарифу подряд (backend.md, пример ответа:
// три периода standard, затем три premium) — reduce с сохранением порядка первого появления
// плана, без сортировки на клиенте.
const groupByPlan = (extend: BillingExtendOption[]): PlanGroup[] => {
  const groups: PlanGroup[] = [];
  for (const opt of extend) {
    let group = groups.find((g) => g.planCode === opt.plan_code);
    if (!group) {
      group = {
        planCode: opt.plan_code,
        planName: opt.plan_name,
        options: [],
        recommendedMonths: null,
      };
      groups.push(group);
    }
    group.options.push(opt);
  }
  for (const group of groups) {
    const maxDiscount = Math.max(...group.options.map((o) => o.discount_percent));
    const best =
      maxDiscount > 0 ? group.options.find((o) => o.discount_percent === maxDiscount) : undefined;
    group.recommendedMonths = best?.months ?? null;
  }
  return groups;
};

const PeriodOptionCard = ({
  option,
  recommended,
  disabled,
  onSelect,
}: {
  option: BillingExtendOption;
  recommended: boolean;
  disabled: boolean;
  onSelect: () => void;
}) => (
  <Paper
    variant="outlined"
    sx={{
      p: 1.5,
      borderColor: recommended ? 'primary.main' : undefined,
      borderWidth: recommended ? 2 : 1,
    }}
  >
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">{monthsLabel(option.months)}</Typography>
        {recommended && <Chip size="small" color="primary" label="Выгоднее всего" />}
      </Stack>
      <Typography variant="h6">{formatMoneyMinor(option.amount_minor)}</Typography>
      <Typography variant="caption" color="text.secondary">
        ≈ {formatMoneyMinor(option.monthly_minor)}/мес
      </Typography>
      {option.savings_minor > 0 && (
        <Typography variant="body2" color="success.main" fontWeight={600}>
          выгода {formatMoneyMinor(option.savings_minor)}
        </Typography>
      )}
      <Button
        variant={recommended ? 'contained' : 'outlined'}
        size="small"
        disabled={disabled}
        onClick={onSelect}
        sx={{ mt: 1 }}
      >
        Оплатить
      </Button>
    </Stack>
  </Paper>
);

// Блок «Продление» (admin.md): по карточке на тариф, внутри — три периода (1/3/6 мес) с
// суммой/ценой месяца/выгодой. Клик по периоду сразу уходит в checkout — отдельного шага
// «выбрать, потом подтвердить» ТЗ не требует («Кнопка варианта → POST .../checkout → редирект»).
export const BillingExtendCards = ({
  options,
  disabled,
  onSelect,
}: {
  options: BillingOptions;
  disabled: boolean;
  onSelect: (planCode: string, months: number) => void;
}) => {
  const groups = useMemo(() => groupByPlan(options.extend), [options.extend]);
  if (groups.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Продлить подписку
        </Typography>
        <Grid container spacing={2}>
          {groups.map((group) => (
            <Grid item xs={12} md={6} key={group.planCode}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1">{group.planName}</Typography>
                  {group.planCode === options.current_plan_code && (
                    <Chip size="small" variant="outlined" label="Ваш тариф" />
                  )}
                </Stack>
                <Stack spacing={1}>
                  {group.options.map((opt) => (
                    <PeriodOptionCard
                      key={opt.months}
                      option={opt}
                      recommended={opt.months === group.recommendedMonths}
                      disabled={disabled}
                      onSelect={() => onSelect(opt.plan_code, opt.months)}
                    />
                  ))}
                </Stack>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

// Блок «Перейти на Премиум» (admin.md): показывается только при upgrade.available=true —
// already_premium/trialing/no_paid_period сервер отдаёт available=false, объяснять пользователю
// нечего (ТЗ, «Блок «Перейти на Премиум»»). Поля-опции контракта (backend.md п.2) не приходят
// пустыми, когда available=true, но типы допускают null/undefined — рендерим с фолбэками, без
// non-null assertion (global rule), а не падаем при их отсутствии.
export const BillingUpgradeCard = ({
  options,
  disabled,
  onSelect,
}: {
  options: BillingOptions;
  disabled: boolean;
  onSelect: (planCode: string) => void;
}) => {
  const { upgrade } = options;
  if (!upgrade.available) return null;
  const planName = upgrade.to_plan_name ?? 'Премиум';
  const planCode = upgrade.to_plan_code;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Перейти на {planName}
        </Typography>
        <Typography>
          Доплатите {formatMoneyMinor(upgrade.amount_minor)} — {planName} включится сразу, срок
          оплаченного периода не изменится (до {formatDate(upgrade.current_period_end)}).
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          disabled={disabled || !planCode}
          onClick={() => planCode && onSelect(planCode)}
        >
          Доплатить и перейти на {planName}
        </Button>
      </CardContent>
    </Card>
  );
};
