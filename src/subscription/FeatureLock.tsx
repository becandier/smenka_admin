import { cloneElement, useState, type ReactElement, type MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

// Диалог «Доступно на тарифе Премиум» (admin.md, «Гейтинг функций тарифа»): апсейл, а не
// сухая ошибка — со ссылкой на экран «Тариф». featureLabel — что именно недоступно
// («Штрафы», «Импорт теста из JSON»), подставляется в текст.
export const FeatureLockDialog = ({
  open,
  featureLabel,
  onClose,
}: {
  open: boolean;
  featureLabel: string;
  onClose: () => void;
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>Доступно на тарифе Премиум</DialogTitle>
    <DialogContent>
      <Typography>
        {featureLabel} входит в тариф «Премиум». На вашем текущем тарифе эта функция недоступна —
        перейдите на «Тариф», чтобы сравнить тарифы и узнать, как оплатить.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Закрыть</Button>
      <Button component={RouterLink} to="/tariff" variant="contained" onClick={onClose}>
        Открыть «Тариф»
      </Button>
    </DialogActions>
  </Dialog>
);

// ВАЖНО: children обязан по-настоящему поддерживать проп `disabled` (react-admin'овские
// CreateButton/SaveButton/DeleteButton/DeleteWithConfirmButton, любой MUI <Button> — да;
// собственные компоненты без прокидывания `disabled` в свой внутренний <Button> — нет,
// см. RestoreButton, где disabled специально добавлен именно ради этого использования).
// Без реального disabled на нативной кнопке клик всё равно долетит до её onClick раньше,
// чем сработает перехват на обёртке (bubbling идёт от цели наружу) — обёртка лишь
// ДОПОЛНИТЕЛЬНО показывает диалог, но не подменяет клик сама по себе.

// Обёртка-замок (admin.md, «функции… не прячем, а показываем с замком»): рендерит переданную
// кнопку задизейбленной с иконкой замка, клик по обёртке (не по самой disabled-кнопке —
// у настоящего disabled-элемента браузер не диспатчит клик вовсе, поэтому обработчик вешаем
// на span-обёртку — тот же приём, что рекомендует MUI для disabled + Tooltip). locked=false —
// пропускает children как есть, без единого лишнего DOM-узла.
export const FeatureLockButton = ({
  locked,
  featureLabel,
  children,
}: {
  locked: boolean;
  featureLabel: string;
  children: ReactElement;
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!locked) return children;

  const handleWrapperClick = (e: MouseEvent<HTMLSpanElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDialogOpen(true);
  };

  return (
    <>
      <Tooltip title="Доступно на тарифе Премиум">
        {/* span-обёртка — стандартный приём MUI Tooltip/клика поверх disabled-кнопки:
            у disabled-элемента события мыши не всплывают, слушатель вешаем на обёртку. */}
        <span onClick={handleWrapperClick} style={{ display: 'inline-flex' }}>
          {cloneLocked(children)}
        </span>
      </Tooltip>
      <FeatureLockDialog
        open={dialogOpen}
        featureLabel={featureLabel}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
};

// Замок для icon-only кнопок (IconButton — сама иконка это children, не startIcon, поэтому
// cloneLocked/FeatureLockButton для них не подходит): рендерит IconButton с иконкой замка
// вместо исходной, disabled, клик по обёртке открывает FeatureLockDialog. Тот же приём с
// span-обёрткой, что и в FeatureLockButton (disabled-элемент не диспатчит клик).
export const LockedIconButton = ({
  ariaLabel,
  featureLabel,
}: {
  ariaLabel: string;
  featureLabel: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Доступно на тарифе Премиум">
        <span onClick={() => setOpen(true)} style={{ display: 'inline-flex' }}>
          <IconButton size="small" aria-label={ariaLabel} disabled>
            <LockIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <FeatureLockDialog open={open} featureLabel={featureLabel} onClose={() => setOpen(false)} />
    </>
  );
};

// Полноэкранная заглушка для маршрутов, целиком закрытых тарифом (admin.md, «Раздел
// «Штрафы» … на экране вместо таблицы — заглушка»): например, прямой переход на
// /penalty-templates/create без фичи fines. Со ссылкой на «Тариф», без «заглушек вида
// «скоро»» — текст сразу объясняет, чего не хватает и что делать.
export const PremiumRequiredScreen = ({ featureLabel }: { featureLabel: string }) => (
  <Box sx={{ p: 3, textAlign: 'center' }}>
    <LockIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
    <Typography variant="h6" gutterBottom>
      {featureLabel} доступны на тарифе Премиум
    </Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      На вашем текущем тарифе эта функция недоступна.
    </Typography>
    <Button component={RouterLink} to="/tariff" variant="contained">
      Открыть «Тариф»
    </Button>
  </Box>
);

// Дизейблит кнопку и подставляет иконку замка вместо исходного startIcon, не трогая
// остальные пропы (label и т.п. остаются как есть — видно, ЧТО именно заблокировано).
// React.cloneElement — штатный способ подмешать пропы в переданный элемент, сохраняя
// его настоящий тип/key/ref (ручной спред самого объекта элемента этого не гарантирует).
const cloneLocked = (element: ReactElement): ReactElement =>
  cloneElement(element as ReactElement<{ disabled?: boolean; startIcon?: ReactElement }>, {
    disabled: true,
    startIcon: <LockIcon fontSize="small" />,
  });
