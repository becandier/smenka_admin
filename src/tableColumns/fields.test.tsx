import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { arrangeFields, parseFields, unavailableColumn } from './fields';
import { resolveLayout, viewOf } from './layout';

const Field = (props: { label?: string; source?: string }) => {
  void props;
  return null;
};
const Action = () => null;

const keysOf = (elements: ReactElement[]) =>
  elements.map((el) => (el.props as { label?: string }).label ?? `<${String(el.key)}>`);

describe('parseFields', () => {
  it('столбцы с key — настраиваемые, без key — служебные, false пропускается', () => {
    const parsed = parseFields([
      <Field key="employee" label="Сотрудник" />,
      <Field key="email" label="Email" />,
      false,
      unavailableColumn('rate'),
      <Field key="started_at" label="Начало" />,
      <Action />,
    ]);
    expect(parsed.columns).toEqual([
      { id: 'employee', label: 'Сотрудник', available: true },
      { id: 'email', label: 'Email', available: true },
      { id: 'rate', label: '', available: false },
      { id: 'started_at', label: 'Начало', available: true },
    ]);
    expect(parsed.service).toHaveLength(1);
    expect(parsed.problems).toEqual([]);
  });

  it('сообщает о нарушениях соглашения об идентификаторах', () => {
    const parsed = parseFields([
      <Field key="Сотрудник" label="Сотрудник" />,
      <Field key="email" label="Email" />,
      <Field key="email" label="Email 2" />,
      <Field key="no_label" />,
    ]);
    expect(parsed.problems).toHaveLength(3);
    expect(parsed.columns.map((c) => c.id)).toEqual(['Сотрудник', 'email', 'no_label']);
  });
});

describe('arrangeFields', () => {
  const fields = [
    <Field key="employee" label="Сотрудник" />,
    <Field key="email" label="Email" />,
    unavailableColumn('rate'),
    <Field key="status" label="Статус" />,
    <Action />,
  ];

  it('без раскладки — исходный порядок, служебные в конце', () => {
    const parsed = parseFields(fields);
    const view = viewOf(resolveLayout(undefined, parsed.columns), parsed.columns);
    expect(keysOf(arrangeFields(parsed, view))).toEqual([
      'Сотрудник',
      'Email',
      'Статус',
      '<service-0>',
    ]);
  });

  it('применяет порядок и скрытие, недоступный не рисуется', () => {
    const parsed = parseFields(fields);
    const layout = resolveLayout(
      { v: 1, order: ['employee', 'status', 'rate', 'email'], hidden: ['email'] },
      parsed.columns,
    );
    expect(keysOf(arrangeFields(parsed, viewOf(layout, parsed.columns)))).toEqual([
      'Сотрудник',
      'Статус',
      '<service-0>',
    ]);
  });
});
