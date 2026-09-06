import { describe, expect, it } from 'vitest';
import { splitScheduleAssignments } from './checklistSchedule';

describe('splitScheduleAssignments', () => {
  it('shows a paused selected schedule as stale and keeps it removable', () => {
    const result = splitScheduleAssignments(
      [
        { id: 'active', is_paused: false },
        { id: 'paused-selected', is_paused: true },
        { id: 'paused-unselected', is_paused: true },
      ],
      ['paused-selected'],
    );

    expect(result.active.map((schedule) => schedule.id)).toEqual(['active']);
    expect(result.stale.map((schedule) => schedule.id)).toEqual(['paused-selected']);
  });
});
