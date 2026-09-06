export interface ChecklistScheduleOption {
  id: string | number;
  name?: string | null;
  is_paused?: boolean | null;
}

export const splitScheduleAssignments = <T extends ChecklistScheduleOption>(
  schedules: T[],
  selectedIds: string[],
): { active: T[]; stale: T[] } => ({
  active: schedules.filter((schedule) => schedule.is_paused !== true),
  stale: schedules.filter(
    (schedule) => schedule.is_paused === true && selectedIds.includes(String(schedule.id)),
  ),
});
