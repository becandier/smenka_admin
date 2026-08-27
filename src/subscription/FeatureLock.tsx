import { useState, type ReactElement, type MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

// Обёртка-замок (admin.md, «функции… не прячем, а показываем с замком»): рендерит переданную
// кнопку задизейбленной с иконкой замка, клик по обёртке (не по самой disabled-кнопке —
// события на ней не всплывают) открывает FeatureLockDialog. locked=false — пропускает
// children как есть, без единого лишнего DOM-узла.
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

// Дизейблит кнопку и подставляет иконку замка вместо исходного startIcon, не трогая
// остальные пропы (label и т.п. остаются как есть — видно, ЧТО именно заблокировано).
const cloneLocked = (element: ReactElement): ReactElement => {
  const props = element.props as Record<string, unknown>;
  return {
    ...element,
    props: {
      ...props,
      disabled: true,
      startIcon: <LockIcon fontSize="small" />,
    },
  } as ReactElement;
};
