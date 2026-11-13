import { useMemo, useState } from 'react';
import type { UserDto } from '@app/shared';
import { api, errorMessage } from '../../core/api.ts';
import { invalidate, useAction, useQuery } from '../../core/data.ts';
import { Alert, PageHeader, TextField } from '@app/shared/ui';

interface GenerateResult {
  dryRun: boolean;
  applied: boolean;
  generatedDays: number;
  users: Array<{ userId: number; fullName: string; intervals: number }>;
  conflicts: Array<{ userId: number; fullName: string; intervals: Array<{ startDate: string; endDate: string; status: string }> }>;
}

export function ScheduleGeneratePage() {
  const year = new Date().getFullYear();
  const users = useQuery('schedule:users', () => api.get<UserDto[]>('/me/work-schedule/users'));
  const [selected, setSelected] = useState<number[]>([]);
  const [values, setValues] = useState({
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    workDays: '14',
    restDays: '14',
    travelDays: '1',
  });
  const [preview, setPreview] = useState<GenerateResult | null>(null);

  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const toggle = (id: number) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const payload = useMemo(
    () => ({
      userIds: selected,
      startDate: values.startDate,
      endDate: values.endDate,
      workDays: Number(values.workDays),
      restDays: Number(values.restDays),
      travelDays: Number(values.travelDays),
    }),
    [selected, values],
  );

  const runPreview = useAction(() => api.post<GenerateResult>('/me/work-schedule/generate', { ...payload, apply: false }), {
    onSuccess: (result) => setPreview(result),
  });
  const applySafe = useAction(() => api.post<GenerateResult>('/me/work-schedule/generate', { ...payload, apply: true, force: false }), {
    onSuccess: (result) => {
      setPreview(result);
      invalidate('schedule');
    },
  });
  const applyForce = useAction(() => api.post<GenerateResult>('/me/work-schedule/generate', { ...payload, apply: true, force: true }), {
    onSuccess: (result) => {
      setPreview(result);
      invalidate('schedule');
    },
  });

  return (
    <>
      <PageHeader
        title="Генерация графика"
        subtitle="Вахтовый график (интервалы WORK / FREE_SHIFT) только для сотрудников вашей зоны. Существующие записи не перезаписываются без подтверждения."
      />
      <div className="panel pad schedule-generator stack">
        {users.error && <Alert>{users.error}</Alert>}
        <div className="form-grid">
          <TextField label="Начало периода" type="date" value={values.startDate} onChange={(event) => set('startDate', event.target.value)} />
          <TextField label="Конец периода" type="date" value={values.endDate} onChange={(event) => set('endDate', event.target.value)} />
        </div>
        <div className="form-grid">
          <TextField label="Дней работы" type="number" min={1} max={60} value={values.workDays} onChange={(event) => set('workDays', event.target.value)} />
          <TextField label="Дней отдыха" type="number" min={1} max={60} value={values.restDays} onChange={(event) => set('restDays', event.target.value)} />
          <TextField label="Дней дороги" type="number" min={0} max={14} value={values.travelDays} onChange={(event) => set('travelDays', event.target.value)} />
        </div>

        <div>
          <div className="bold mb">Сотрудники</div>
          {!users.data?.length && <div className="muted">Нет сотрудников в зоне</div>}
          <div className="stack" style={{ maxHeight: 240, overflow: 'auto' }}>
            {(users.data ?? []).map((user) => (
              <label key={user.id} className="check">
                <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} />
                {user.fullName}
              </label>
            ))}
          </div>
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn" disabled={!selected.length || runPreview.pending} onClick={() => runPreview.run()}>
            Проверить конфликты
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected.length || applySafe.pending || (preview?.conflicts.length ?? 0) > 0}
            onClick={() => applySafe.run()}
          >
            Применить без перезаписи
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selected.length || !preview?.conflicts.length || applyForce.pending}
            onClick={() => applyForce.run()}
          >
            Перезаписать конфликтующие
          </button>
        </div>

        {(runPreview.error || applySafe.error || applyForce.error) ? (
          <Alert>{errorMessage(runPreview.error || applySafe.error || applyForce.error)}</Alert>
        ) : null}
        {preview && (
          <Alert kind={preview.conflicts.length ? 'info' : 'success'}>
            {preview.applied
              ? `График применён: ${preview.generatedDays} дней для ${preview.users.length} сотрудников.`
              : `Предпросмотр: ${preview.generatedDays} дней для ${preview.users.length} сотрудников.`}
            {preview.conflicts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                Конфликты ({preview.conflicts.length}):
                <ul>
                  {preview.conflicts.map((item) => (
                    <li key={item.userId}>
                      {item.fullName}: {item.intervals.length} существующих интервалов
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Alert>
        )}
      </div>
    </>
  );
}
