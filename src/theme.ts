import type { RaThemeOptions } from 'react-admin';
import { alpha, type Theme } from '@mui/material/styles';
import type { SxProps } from '@mui/material';
import { brand, blueTints, fontFamilySans } from './brand';

// Радиус «карточки» таблиц (рамка + скругление угловых ячеек RaDatagrid) — как у MuiCard,
// но отдельная константа: используется в нескольких местах ниже, значение остаётся 16.
const tableCardRadius = 16;

// Тинт hover-подсветки строки — вычисляем один раз, используем в обоих стопах градиента
// (см. MuiTableRow ниже).
const tableRowHoverTint = alpha(brand.blue, 0.08);

// Точечный контейнмент для по-настоящему широких Datagrid-таблиц. Сейчас единственный
// потребитель — список смен (orgShifts.tsx, 13 колонок): почему это НЕ часть темы глобально
// (overflow на .RaDatagrid-tableWrapper ломает sticky-шапку на ВСЕХ Datagrid-списках, не
// только широких) — см. комментарий у RaDatagrid ниже. Экспортируется, чтобы следующая
// широкая таблица переиспользовала готовое решение через sx, а не копировала блок стилей.
export const wideDatagridScrollSx: SxProps<Theme> = {
  '& .RaDatagrid-tableWrapper': {
    overflow: 'auto',
    maxHeight: '70vh',
  },
};

// Бренд Smenka. react-admin сам прогоняет options через MUI createTheme.
// Канон значений — docs/tasks/rebranding/brand_contract.md.
export const theme: RaThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: brand.blue, dark: brand.blueDeep, contrastText: brand.paper },
    secondary: { main: brand.blueMid },
    text: { primary: brand.ink, secondary: brand.muted },
    divider: brand.line,
    background: { default: brand.wash, paper: brand.paper },
    // error/warning/success/info — функциональные, оставляем дефолтные MUI.
  },
  shape: { borderRadius: 12 }, // control
  typography: {
    fontFamily: fontFamilySans,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: { fontWeight: 600, fontSize: '2.5rem', letterSpacing: '-0.03em' }, // display 40
    h2: { fontWeight: 600, fontSize: '1.625rem', letterSpacing: '-0.02em' }, // heading 26
    body1: { fontSize: '1.0625rem' }, // body 17
    button: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        // pressed = primary.dark (Deep Blue)
        containedPrimary: { '&:active': { backgroundColor: brand.blueDeep } },
      },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: 16 } }, // card radius
    },

    // --- Таблицы (admin_table_styles) ----------------------------------
    // Единая точка правки: Datagrid (react-admin) и голые MUI Table
    // (checklistTemplates/memberRates/workSchedules/platformSettings/payroll)
    // получают оформление отсюда — без правок в src/resources/*.
    // Канон значений — docs/tasks/admin_table_styles/admin.md.

    MuiTable: {
      // Плотность по умолчанию: любая новая таблица в проекте компактна,
      // даже если разработчик забудет явно передать size="small".
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: ({ theme }: { theme: Theme }) => ({
          backgroundColor: brand.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: tableCardRadius, // как у MuiCard — таблица тоже читается карточкой
          borderCollapse: 'separate', // без него border-radius на <table> не рендерится
          borderSpacing: 0,
        }),
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          // Работает для голых Table: их ячейки шапки не красят фон сами (в отличие
          // от Datagrid — там непрозрачный фон уже держит сама ячейка, см. RaDatagrid
          // ниже), поэтому фон thead просвечивает сквозь них.
          backgroundColor: blueTints[10],
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        // MUI по умолчанию высветляет divider на ~88% для границы ячейки — разделители
        // строк были почти не видны на белом фоне. Возвращаем настоящий divider из палитры
        // (та же brand.line, но без дублирования источника — см. palette.divider выше).
        root: ({ theme }: { theme: Theme }) => ({ borderColor: theme.palette.divider }),
        // Отдельный слот 'head' — штатный ownerState.variant TableCell (см. MUI TableCell:
        // overridesResolver подставляет styles[ownerState.variant] сам), не нужно вручную
        // ветвить root по variant. Жирнее, трекинг, более заметная нижняя граница — шапка
        // «держит» таблицу заметнее рядовых разделителей.
        head: ({ theme }: { theme: Theme }) => ({
          fontWeight: theme.typography.fontWeightBold,
          color: theme.palette.text.secondary,
          letterSpacing: '0.02em',
          borderBottomWidth: 2,
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          // Последняя строка — без «висящей» линии снизу. Селектор бьёт только по <td>
          // (тело), заголовочные ячейки — <th>, их не задевает.
          '&:last-child td': { borderBottom: 'none' },
          // Hover не завязан на проп hover={true}: голые Table в ресурсах его не передают,
          // но по ТЗ подсветка нужна везде. tbody исключает строку шапки.
          // backgroundImage (не backgroundColor!): у :hover в теме специфичность выше
          // одиночного класса от sx на строке, поэтому обычный backgroundColor молча
          // перекрывал бы точечную подсветку строк в ресурсах (action.selected — текущая
          // ставка в memberRates.tsx, warning.light — смена без ставки в PayrollListView) —
          // её явно просили не трогать. Полупрозрачный слой поверх — не конкурирует
          // с background-color, ложится поверх любого фона строки.
          'tbody &:hover': {
            backgroundImage: `linear-gradient(${tableRowHoverTint}, ${tableRowHoverTint})`,
          },
        },
      },
    },

    // Datagrid: рамка/фон/скругление — на корневом div, а не на самой <table> (тулбар
    // массовых действий должен лежать в той же рамке).
    //
    // ВАЖНО: здесь сознательно НЕТ overflow (ни hidden, ни auto) ни на .RaDatagrid-root,
    // ни на .RaDatagrid-tableWrapper. .RaDatagrid-headerCell несёт штатный CSS react-admin
    // position:sticky; top:0 (useDatagridStyles.tsx) — а по спецификации CSS overflow !=
    // visible на ЛЮБОМ предке реклассифицирует его в scroll-container для position:sticky.
    // Высота и root, и tableWrapper всегда равна высоте их содержимого (они сами никогда
    // не скроллятся), поэтому «липкая» шапка относительно такого предка вырождается в
    // обычную статичную — ломается на ВСЕХ Datagrid-списках сразу, не только на широких.
    // Поэтому скругление углов — не клипом, а явным border-radius на угловых ячейках
    // (та же техника, что уже использует сам react-admin для верхних углов шапки, — здесь
    // только приводим радиус к 16, как у рамки, и добавляем нижние углы последней строки).
    // Sticky-шапку не переизобретаем — только красим её фон/шрифт поверх (styleOverrides
    // темы всегда сильнее хардкода компонента: механизм MUI styled(name, overridesResolver)
    // добавляет их ПОСЛЕ базовых стилей с той же специфичностью — источник побеждает по
    // порядку). Горизонтальный скролл единственной по-настоящему широкой таблицы (смены,
    // 13 колонок) — точечно в orgShifts.tsx, с тем же обоснованием в комментарии там.
    RaDatagrid: {
      styleOverrides: {
        root: ({ theme }: { theme: Theme }) => ({
          backgroundColor: brand.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: tableCardRadius,
          '& .RaDatagrid-table': {
            // Рамку и фон уже даёт .RaDatagrid-root — не дублируем на самой <table>.
            border: 'none',
            borderRadius: 0,
          },
          '& .RaDatagrid-headerCell': {
            backgroundColor: blueTints[10],
          },
          '& .RaDatagrid-headerCell:first-of-type': { borderTopLeftRadius: tableCardRadius },
          '& .RaDatagrid-headerCell:last-child': { borderTopRightRadius: tableCardRadius },
          '& .RaDatagrid-tbody > tr:last-child > td:first-of-type': {
            borderBottomLeftRadius: tableCardRadius,
          },
          '& .RaDatagrid-tbody > tr:last-child > td:last-child': {
            borderBottomRightRadius: tableCardRadius,
          },
        }),
      },
    },
  },
};
