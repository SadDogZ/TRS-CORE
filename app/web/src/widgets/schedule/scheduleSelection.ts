import type { WorkDayStatus } from '@app/shared';

/** Непрерывный диапазон дат между якорем и текущей ячейкой (включительно). */
export function rangeDates(allDates: string[], anchor: string, date: string): string[] {
  const start = allDates.indexOf(anchor);
  const end = allDates.indexOf(date);
  if (start < 0 || end < 0) return [date];
  return allDates.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/** Ctrl/Meta: добавить дату в выделение или убрать, если уже выбрана. */
export function toggleDateSelection(selected: string[], date: string): string[] {
  return selected.includes(date) ? selected.filter((item) => item !== date) : [...selected, date];
}

/** Разные статусы (включая «не задано») среди выделенных ячеек. */
export function selectionHasMixedStatuses(selected: string[], statuses: Map<string, WorkDayStatus>): boolean {
  if (selected.length <= 1) return false;
  const first = statuses.get(selected[0]) ?? null;
  return selected.some((date) => (statuses.get(date) ?? null) !== first);
}

/** Держит меню в пределах видимой области экрана. */
export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport = { width: typeof window !== 'undefined' ? window.innerWidth : 1280, height: typeof window !== 'undefined' ? window.innerHeight : 720 },
  pad = 8,
): { left: number; top: number } {
  return {
    left: Math.min(Math.max(pad, x), Math.max(pad, viewport.width - width - pad)),
    top: Math.min(Math.max(pad, y), Math.max(pad, viewport.height - height - pad)),
  };
}
