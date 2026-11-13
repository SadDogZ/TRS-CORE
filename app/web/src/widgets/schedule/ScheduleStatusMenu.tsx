import { useLayoutEffect, useState } from 'react';
import { WORK_DAY_STATUSES, type WorkDayStatus } from '@app/shared';
import { useClickOutside } from '@app/shared/ui';
import { clampMenuPosition } from './scheduleSelection';
import { WORK_SCHEDULE_COLORS, WORK_SCHEDULE_LABELS } from './schedulePresentation';

interface ScheduleStatusMenuProps {
  x: number;
  y: number;
  onSelect: (status: WorkDayStatus) => void;
  onClose: () => void;
}

export function ScheduleStatusMenu({ x, y, onSelect, onClose }: ScheduleStatusMenuProps) {
  const ref = useClickOutside(true, onClose);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPos(clampMenuPosition(x, y, width, height));
  }, [x, y, ref]);

  return (
    <div ref={ref} className="schedule-status-menu" style={{ left: pos.left, top: pos.top }} role="menu" aria-label="Выбор статуса графика">
      {WORK_DAY_STATUSES.map((status) => (
        <button key={status} type="button" role="menuitem" className="schedule-status-menu-item" onClick={() => onSelect(status)}>
          <i className="schedule-status-swatch" style={{ background: WORK_SCHEDULE_COLORS[status] }} aria-hidden />
          {WORK_SCHEDULE_LABELS[status]}
        </button>
      ))}
    </div>
  );
}
