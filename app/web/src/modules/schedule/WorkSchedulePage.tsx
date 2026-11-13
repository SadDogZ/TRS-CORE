import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { UserDto, WorkDayStatus, WorkScheduleIntervalsDto } from '@app/shared';
import { groupScheduleDates, groupScheduleDays, expandScheduleIntervals } from '@app/shared';
import { api } from '../../core/api.ts';
import { useCurrentUser } from '../../core/auth.tsx';
import { useQuery, useAction, invalidate } from '../../core/data.ts';
import { useRouter } from '../../core/router.tsx';
import { Alert, ConfirmDialog, SelectField } from '@app/shared/ui';
import {
  ScheduleControlPanel,
  ScheduleStatusMenu,
  WorkScheduleCalendar,
  WorkScheduleLegend,
  getScheduleDates,
  rangeDates,
  selectionHasMixedStatuses,
  toggleDateSelection,
} from '../../widgets/schedule';

const yearTabs = (year: number) => [year, year + 1, ...Array.from({ length: 5 }, (_, index) => year - index - 1)];

export function WorkSchedulePage() {
  const me = useCurrentUser();
  const { search } = useRouter();
  const initialUser = search.get('userId') ?? '';
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selectedUser, setSelectedUser] = useState(initialUser);
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<WorkDayStatus | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState<Map<string, WorkDayStatus> | null>(null);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const selectedRef = useRef(selected);
  const draggingRef = useRef(false);
  const anchorRef = useRef<string | null>(null);
  const rangeModeRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });

  selectedRef.current = selected;

  const save = useAction(async () => {
    if (!draft) return;
    const root = '/me/work-schedule';
    for (const range of groupScheduleDates([...deleted])) {
      await api.delete(`${root}/intervals/${selectedUser}`, range);
    }
    const changed = groupScheduleDays(
      [...draft]
        .filter(([date, status]) => !deleted.has(date) && saved.get(date) !== status)
        .map(([date, status]) => ({ userId: Number(selectedUser), date, status })),
    );
    for (const interval of changed) {
      await api.put(`${root}/intervals/${selectedUser}`, {
        startDate: interval.startDate,
        endDate: interval.endDate,
        status: interval.status,
      });
    }
    setDraft(null);
    setDeleted(new Set());
    invalidate('schedule');
  });
  const canEdit = me.systemRoles.some((role) => ['ADMIN', 'MANAGER', 'COORDINATOR'].includes(role));
  const users = useQuery(canEdit ? 'schedule:users' : null, () => api.get<UserDto[]>('/me/work-schedule/users'));
  const path = '/me/work-schedule';
  const { data, error } = useQuery(`schedule:${canEdit}:${selectedUser}:${year}`, () =>
    api.get<WorkScheduleIntervalsDto>(`${path}/intervals`, { userId: selectedUser, year }),
  );
  const saved = expandScheduleIntervals(data?.intervals ?? [], `${year}-01-01`, `${year}-12-31`);
  const map = draft ?? saved;

  useEffect(() => {
    if (!canEdit || selectedUser || !users.data?.length) return;
    setSelectedUser(String(users.data[0].id));
  }, [canEdit, selectedUser, users.data]);

  const clearSelection = useCallback(() => {
    selectedRef.current = [];
    setSelected([]);
    setMenu(null);
    setPendingStatus(null);
    anchorRef.current = null;
    rangeModeRef.current = false;
  }, []);

  useEffect(() => {
    const finish = (event: Event) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const point = 'clientX' in event ? (event as globalThis.PointerEvent) : null;
      if (point) pointerRef.current = { x: point.clientX, y: point.clientY };
      if (!canEdit || selectedRef.current.length === 0) return;
      setMenu({ x: pointerRef.current.x, y: pointerRef.current.y });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      clearSelection();
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', onKey);
    };
  }, [canEdit, clearSelection]);

  const select = (date: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!canEdit || !selectedUser) return;
    event.preventDefault();
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setMenu(null);
    setPendingStatus(null);
    if (event.ctrlKey || event.metaKey) {
      rangeModeRef.current = false;
      setSelected((current) => {
        const next = toggleDateSelection(current, date);
        selectedRef.current = next;
        return next;
      });
    } else {
      rangeModeRef.current = true;
      anchorRef.current = date;
      selectedRef.current = [date];
      setSelected([date]);
    }
    draggingRef.current = true;
  };

  const enter = (date: string) => {
    if (!draggingRef.current || !rangeModeRef.current || !anchorRef.current) return;
    const next = rangeDates(getScheduleDates(year), anchorRef.current, date);
    selectedRef.current = next;
    setSelected(next);
  };

  const applyStatus = (status: WorkDayStatus) => {
    const targets = selectedRef.current;
    if (!targets.length) return;
    setDraft((currentDraft) => {
      const nextMap = new Map(currentDraft ?? map);
      targets.forEach((target) => nextMap.set(target, status));
      return nextMap;
    });
    setDeleted((current) => {
      if (!targets.some((date) => current.has(date))) return current;
      const next = new Set(current);
      targets.forEach((date) => next.delete(date));
      return next;
    });
    clearSelection();
  };

  const requestStatus = (status: WorkDayStatus) => {
    if (selectionHasMixedStatuses(selectedRef.current, map)) {
      setPendingStatus(status);
      setMenu(null);
      return;
    }
    applyStatus(status);
  };

  const clearSelected = () => {
    setDeleted((current) => new Set([...current, ...selected]));
    setDraft((current) => {
      const next = new Map(current ?? map);
      selected.forEach((date) => next.delete(date));
      return next;
    });
    clearSelection();
  };

  return (
    <>
      <ScheduleControlPanel
        title={canEdit ? 'График сотрудника' : 'Мой график'}
        subtitle="ЛКМ — диапазон дат, Ctrl — отдельные ячейки. После выделения выберите статус в меню. Колесо только прокручивает календарь."
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      >
        <div className="schedule-year-tabs">
          {yearTabs(currentYear).map((tabYear, index) => (
            <button
              key={tabYear}
              type="button"
              className={`schedule-year-tab${year === tabYear ? ' active' : ''}`}
              onClick={() => {
                setYear(tabYear);
                clearSelection();
                setDraft(null);
              }}
            >
              {index > 1 ? `${tabYear} Архив` : tabYear}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="row wrap mb">
            <SelectField
              label="Сотрудник"
              value={selectedUser}
              onChange={(event) => {
                setSelectedUser(event.target.value);
                clearSelection();
                setDraft(null);
              }}
            >
              <option value="">Выберите сотрудника</option>
              {users.data?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </SelectField>
            {selected.length > 0 && (
              <>
                <span className="chip primary">Выбрано: {selected.length}</span>
                <button type="button" className="btn btn-danger" onClick={clearSelected}>
                  Очистить
                </button>
              </>
            )}
          </div>
        )}
        <WorkScheduleLegend />
        {error && <Alert>{error}</Alert>}
        {draft && (
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={save.pending} onClick={() => save.run()}>
              Сохранить изменения
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Отменить
            </button>
            {save.pending && <span className="muted">Сохранение…</span>}
          </div>
        )}
      </ScheduleControlPanel>
      {canEdit && !selectedUser ? (
        <div className="empty">Выберите сотрудника для редактирования графика.</div>
      ) : (
        data && (
          <WorkScheduleCalendar
            year={year}
            statuses={map}
            selectedDates={selected}
            onPointerDown={select}
            onPointerEnter={enter}
          />
        )
      )}
      {menu && canEdit && (
        <ScheduleStatusMenu x={menu.x} y={menu.y} onSelect={requestStatus} onClose={() => setMenu(null)} />
      )}
      <ConfirmDialog
        open={pendingStatus !== null}
        title="Разные статусы в выделении"
        text="В выбранных ячейках уже стоят разные статусы. Заменить их выбранным статусом?"
        confirmText="Заменить"
        danger
        onConfirm={() => {
          if (pendingStatus) applyStatus(pendingStatus);
        }}
        onClose={() => setPendingStatus(null)}
      />
    </>
  );
}
