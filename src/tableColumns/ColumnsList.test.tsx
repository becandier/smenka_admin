import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColumnsList } from './ColumnsList';

// Рендер в строку (без jsdom): проверяем, какие элементы управления получает каждая строка.
const render = (labels: string[], hidden: string[] = []) =>
  renderToStaticMarkup(
    <ColumnsList
      columns={labels.map((label, i) => ({ id: `c${i}`, label }))}
      hidden={hidden.map((label) => `c${labels.indexOf(label)}`)}
      dragId={null}
      gripRef={() => undefined}
      onGripPointerDown={() => undefined}
      onGripKeyDown={() => undefined}
      onToggle={() => undefined}
    />,
  );

const grips = (html: string) => html.match(/aria-label="Переместить столбец/g)?.length ?? 0;
const switches = (html: string) => html.match(/aria-label="Показывать столбец/g)?.length ?? 0;

describe('ColumnsList', () => {
  it('у ключевого столбца замок без ручки и переключателя, у остальных — ручка и переключатель', () => {
    const html = render(['Сотрудник', 'Email', 'Статус']);
    expect(html).toContain('Этот столбец показывается всегда');
    expect(grips(html)).toBe(2);
    expect(switches(html)).toBe(2);
    expect(html).not.toContain('Переместить столбец «Сотрудник»');
  });

  it('один перемещаемый столбец — ручки нет, переключатель остаётся', () => {
    const html = render(['Название', 'Создана']);
    expect(grips(html)).toBe(0);
    expect(switches(html)).toBe(1);
  });

  it('скрытый столбец остаётся в списке с выключенным переключателем', () => {
    const html = render(['Сотрудник', 'Email', 'Статус'], ['Email']);
    expect(html).toContain('Email');
    expect(html.match(/checked=""/g)?.length ?? 0).toBe(1);
  });
});
