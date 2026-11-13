import { describe, expect, it } from 'vitest';
import type { WorkDayStatus } from '@app/shared';
import { clampMenuPosition, rangeDates, selectionHasMixedStatuses, toggleDateSelection } from './scheduleSelection';

describe('scheduleSelection', () => {
  const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'];

  it('builds a continuous date range in either direction', () => {
    expect(rangeDates(dates, '2026-03-02', '2026-03-04')).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(rangeDates(dates, '2026-03-04', '2026-03-02')).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(rangeDates(dates, '2026-03-03', '2026-03-03')).toEqual(['2026-03-03']);
  });

  it('toggles individual dates for Ctrl selection', () => {
    expect(toggleDateSelection(['2026-03-01'], '2026-03-03')).toEqual(['2026-03-01', '2026-03-03']);
    expect(toggleDateSelection(['2026-03-01', '2026-03-03'], '2026-03-01')).toEqual(['2026-03-03']);
  });

  it('detects mixed statuses including empty cells', () => {
    const statuses = new Map<string, WorkDayStatus>([
      ['2026-03-01', 'WORK'],
      ['2026-03-02', 'VACATION'],
    ]);
    expect(selectionHasMixedStatuses(['2026-03-01', '2026-03-02'], statuses)).toBe(true);
    expect(selectionHasMixedStatuses(['2026-03-01', '2026-03-03'], statuses)).toBe(true);
    expect(selectionHasMixedStatuses(['2026-03-01', '2026-03-01'], new Map([['2026-03-01', 'WORK']]))).toBe(false);
    expect(selectionHasMixedStatuses(['2026-03-01'], statuses)).toBe(false);
  });

  it('clamps the context menu inside the viewport', () => {
    expect(clampMenuPosition(10, 10, 200, 100, { width: 1000, height: 800 })).toEqual({ left: 10, top: 10 });
    expect(clampMenuPosition(950, 780, 200, 100, { width: 1000, height: 800 })).toEqual({ left: 792, top: 692 });
  });
});
