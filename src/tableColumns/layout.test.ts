import { describe, expect, it } from 'vitest';
import {
  isStandardView,
  moveColumn,
  resolveLayout,
  toStored,
  toggleColumn,
  viewOf,
  type ColumnDef,
} from './layout';

const cols = (...ids: string[]): ColumnDef[] => ids.map((id) => ({ id, available: true }));

const SHIFTS = cols('employee', 'email', 'status', 'started_at', 'worked');

describe('resolveLayout: стандартный вид', () => {
  it('без записи — стандартный порядок, ничего не скрыто', () => {
    const layout = resolveLayout(undefined, SHIFTS);
    expect(layout).toEqual({ order: SHIFTS.map((c) => c.id), hidden: [] });
    expect(isStandardView(layout, SHIFTS)).toBe(true);
    expect(toStored(layout, SHIFTS)).toBeNull();
  });

  it('применяет сохранённые порядок и скрытие', () => {
    const layout = resolveLayout(
      { v: 1, order: ['employee', 'worked', 'status', 'email', 'started_at'], hidden: ['email'] },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'worked', 'status', 'email', 'started_at']);
    expect(layout.hidden).toEqual(['email']);
    expect(isStandardView(layout, SHIFTS)).toBe(false);
  });
});

describe('правило 1: незнакомая версия', () => {
  it.each([
    { v: 2, order: ['worked', 'employee'], hidden: ['email'] },
    { order: ['worked'], hidden: [] },
    { v: 1, order: 'worked' },
    null,
    'garbage',
    [1, 2],
  ])('запись %j игнорируется — стандартный вид', (saved) => {
    expect(resolveLayout(saved, SHIFTS)).toEqual({
      order: SHIFTS.map((c) => c.id),
      hidden: [],
    });
  });
});

describe('правило 2: исчезнувший столбец', () => {
  it('пропускается в порядке и в скрытых', () => {
    const layout = resolveLayout(
      {
        v: 1,
        order: ['employee', 'gone', 'worked', 'status', 'email', 'started_at'],
        hidden: ['gone', 'status'],
      },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'worked', 'status', 'email', 'started_at']);
    expect(layout.hidden).toEqual(['status']);
  });
});

describe('правило 3: новый столбец', () => {
  it('встаёт сразу после ближайшего предшественника из стандартного порядка и показан', () => {
    // В релизе появился started_at между status и worked; сохранено до релиза.
    const layout = resolveLayout(
      { v: 1, order: ['employee', 'worked', 'status', 'email'], hidden: ['status'] },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'worked', 'status', 'started_at', 'email']);
    expect(layout.hidden).toEqual(['status']);
  });

  it('предшественник — только ключевой столбец: встаёт сразу за ключевым', () => {
    const layout = resolveLayout(
      { v: 1, order: ['employee', 'worked', 'started_at', 'status'], hidden: [] },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'email', 'worked', 'started_at', 'status']);
  });

  it('два новых соседа сохраняют стандартный порядок между собой', () => {
    const layout = resolveLayout(
      { v: 1, order: ['employee', 'worked', 'email'], hidden: [] },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'worked', 'email', 'status', 'started_at']);
  });
});

describe('правило 4: ключевой столбец', () => {
  it('всегда первый и видимый, что бы ни было записано', () => {
    const layout = resolveLayout(
      {
        v: 1,
        order: ['worked', 'status', 'employee', 'email', 'started_at'],
        hidden: ['employee', 'email'],
      },
      SHIFTS,
    );
    expect(layout.order).toEqual(['employee', 'worked', 'status', 'email', 'started_at']);
    expect(layout.hidden).toEqual(['email']);
  });

  it('отсутствует в записи — всё равно первый', () => {
    const layout = resolveLayout({ v: 1, order: ['worked', 'status'], hidden: [] }, SHIFTS);
    expect(layout.order[0]).toBe('employee');
  });

  it('не скрывается и не двигается', () => {
    const base = resolveLayout(undefined, SHIFTS);
    expect(toggleColumn(base, SHIFTS, 'employee')).toBe(base);
    expect(moveColumn(base, SHIFTS, 'employee', 3)).toBe(base);
  });

  it('другой столбец нельзя поставить перед ключевым', () => {
    const base = resolveLayout(undefined, SHIFTS);
    expect(moveColumn(base, SHIFTS, 'worked', 0).order).toEqual([
      'employee',
      'worked',
      'email',
      'status',
      'started_at',
    ]);
  });
});

describe('правило 5: недоступный столбец', () => {
  const MEMBERS: ColumnDef[] = [
    { id: 'name', available: true },
    { id: 'login', available: true },
    { id: 'rate', available: false },
    { id: 'joined_at', available: true },
  ];

  it('не попадает в вид', () => {
    const layout = resolveLayout(
      { v: 1, order: ['name', 'rate', 'joined_at', 'login'], hidden: ['rate'] },
      MEMBERS,
    );
    expect(viewOf(layout, MEMBERS)).toEqual({ order: ['name', 'joined_at', 'login'], hidden: [] });
  });

  it('сохраняет место и признак скрытия при следующем сохранении', () => {
    const layout = resolveLayout(
      { v: 1, order: ['name', 'rate', 'joined_at', 'login'], hidden: ['rate'] },
      MEMBERS,
    );
    // Пользователь без доступа к ставке переставил «Логин» вперёд и скрыл «Присоединился».
    const moved = moveColumn(layout, MEMBERS, 'login', 1);
    const next = toggleColumn(moved, MEMBERS, 'joined_at');
    expect(toStored(next, MEMBERS)).toEqual({
      v: 1,
      order: ['name', 'rate', 'login', 'joined_at'],
      hidden: ['rate', 'joined_at'],
    });
    // Доступ появился — ставка возвращается на своё место и остаётся скрытой.
    const withRate = MEMBERS.map((c) => ({ ...c, available: true }));
    const restored = resolveLayout(toStored(next, MEMBERS), withRate);
    expect(viewOf(restored, withRate)).toEqual({
      order: ['name', 'rate', 'login', 'joined_at'],
      hidden: ['rate', 'joined_at'],
    });
  });

  it('недоступный столбец не переключается', () => {
    const layout = resolveLayout(undefined, MEMBERS);
    expect(toggleColumn(layout, MEMBERS, 'rate')).toBe(layout);
  });

  it('скрытый недоступный столбец не делает вид «изменённым»', () => {
    const layout = resolveLayout(
      { v: 1, order: ['name', 'login', 'rate', 'joined_at'], hidden: ['rate'] },
      MEMBERS,
    );
    expect(isStandardView(layout, MEMBERS)).toBe(true);
    // Но запись не стандартная — её нельзя потерять.
    expect(toStored(layout, MEMBERS)).not.toBeNull();
  });
});

describe('перестановка и скрытие', () => {
  it('moveColumn переносит столбец на позицию и зажимает выход за конец', () => {
    const base = resolveLayout(undefined, SHIFTS);
    expect(moveColumn(base, SHIFTS, 'email', 3).order).toEqual([
      'employee',
      'status',
      'started_at',
      'email',
      'worked',
    ]);
    expect(moveColumn(base, SHIFTS, 'email', 99).order).toEqual([
      'employee',
      'status',
      'started_at',
      'worked',
      'email',
    ]);
  });

  it('скрытый столбец остаётся в порядке на своём месте', () => {
    const base = resolveLayout(undefined, SHIFTS);
    const hidden = toggleColumn(base, SHIFTS, 'status');
    expect(hidden.order).toEqual(base.order);
    expect(hidden.hidden).toEqual(['status']);
    expect(toStored(hidden, SHIFTS)).toEqual({
      v: 1,
      order: ['employee', 'email', 'status', 'started_at', 'worked'],
      hidden: ['status'],
    });
    expect(toggleColumn(hidden, SHIFTS, 'status').hidden).toEqual([]);
  });

  it('ручной возврат к стандартному виду даёт null — запись удаляется', () => {
    const base = resolveLayout(undefined, SHIFTS);
    const moved = moveColumn(base, SHIFTS, 'worked', 1);
    expect(toStored(moved, SHIFTS)).not.toBeNull();
    const back = moveColumn(moved, SHIFTS, 'worked', 4);
    expect(toStored(back, SHIFTS)).toBeNull();
    const toggledTwice = toggleColumn(toggleColumn(base, SHIFTS, 'email'), SHIFTS, 'email');
    expect(toStored(toggledTwice, SHIFTS)).toBeNull();
  });
});
