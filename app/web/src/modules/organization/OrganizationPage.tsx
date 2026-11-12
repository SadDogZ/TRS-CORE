import { useState } from 'react';
import { api, errorMessage } from '../../core/api.ts';
import type { PositionDto } from '@app/shared';
import { useCurrentUser } from '../../core/auth.tsx';
import { invalidate, useAction, useQuery } from '../../core/data.ts';
import { Alert, Dialog, Icon, PageHeader, SelectField, TextField } from '@app/shared/ui';
import { ActionError } from '../../widgets/feedback/ActionError';

interface Base { id: number; name: string; code: string | null }
interface Position extends PositionDto {}
interface SystemRole { id: number; code: string; name: string; isActive: boolean }
interface Employee {
  id: number;
  user: {
    id: number;
    fullName: string;
    login: string;
    isActive: boolean;
    isDeleted: boolean;
    systemRoles: { systemRole: SystemRole }[];
  };
  assignments: {
    id: number;
    positionId: number | null;
    baseId: number | null;
    supervisorEmployeeId: number | null;
    track: 'TRS' | 'R_AND_M' | 'UNASSIGNED';
    startsAt: string;
    position: Position | null;
    base: Base | null;
    supervisor: { user: { fullName: string } } | null;
  }[];
  mineAssignments?: { mine: { id: number; name: string } }[];
}
interface Mine {
  id: number;
  name: string;
  baseId: number;
  base: Base;
  _count?: { pads: number; wells: number };
  coordinatorAssignments?: { coordinator: { user: { fullName: string } } }[];
}
interface PadRow { id: number; name: string; isActive: boolean; _count?: { wells: number } }

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const trackFor = (role: string) => (['SENIOR_MECHANIC', 'MECHANIC', 'SHOP_FOREMAN', 'SHOP_EMPLOYEE'].includes(role) ? 'R_AND_M' : 'TRS');

type OrganizationView = 'overview' | 'structure' | 'assignments' | 'transfers';

export function OrganizationPage({ view = 'overview' }: { view?: OrganizationView }) {
  const user = useCurrentUser();
  const isAdmin = user.systemRoles.includes('ADMIN');
  const [assignmentTab, setAssignmentTab] = useState<'assignment' | 'transfer'>(view === 'transfers' ? 'transfer' : 'assignment');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedBaseId, setSelectedBaseId] = useState('');
  const [selectedRole, setSelectedRole] = useState('EMPLOYEE');
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [startsAt, setStartsAt] = useState(today());
  const [reason, setReason] = useState('');
  const [mineName, setMineName] = useState('');
  const [mineBaseId, setMineBaseId] = useState('');
  const [mineDialogOpen, setMineDialogOpen] = useState(false);
  const [mineDetailsId, setMineDetailsId] = useState<number | null>(null);
  const [padName, setPadName] = useState('');
  const [padDialog, setPadDialog] = useState<{ open: boolean; editing: PadRow | null }>({ open: false, editing: null });
  const [showArchivedPads, setShowArchivedPads] = useState(false);
  const [coordinatorByMine, setCoordinatorByMine] = useState<Record<number, string>>({});
  const [transferDateByMine, setTransferDateByMine] = useState<Record<number, string>>({});
  const [errorMessageText, setErrorMessageText] = useState('');

  const basesQuery = useQuery('org:bases', () => api.get<Base[]>('/org/bases'));
  const employeesQuery = useQuery('org:employees', () => api.get<Employee[]>('/me/personnel'));
  const positionsQuery = useQuery('org:positions', () => api.get<Position[]>('/org/positions'));
  const rolesQuery = useQuery('org:roles', () => api.get<SystemRole[]>(isAdmin ? '/admin/org/roles' : '/org/roles'));
  const bases = basesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const positions = positionsQuery.data ?? [];
  const roles = (rolesQuery.data ?? []).filter((role) => role.isActive);
  const signedInEmployee = employees.find((employee) => employee.user.id === user.id);
  const signedInRoleCodes = signedInEmployee?.user.systemRoles.map((grant) => grant.systemRole.code) ?? [];
  const isManager = signedInRoleCodes.includes('MANAGER');
  const isTransfer = view === 'transfers' || assignmentTab === 'transfer';
  const selectedEmployee = employees.find((employee) => String(employee.id) === selectedEmployeeId);
  const currentAssignment = selectedEmployee?.assignments[0];
  const roleForForm: string = positions.find((position) => String(position.id) === selectedPositionId)?.systemRole.code ?? 'EMPLOYEE';
  const destinationBaseId = isTransfer ? selectedBaseId : currentAssignment?.baseId ? String(currentAssignment.baseId) : '';
  const supervisorRole = roleForForm === 'COORDINATOR' ? 'MANAGER' : roleForForm === 'EMPLOYEE' ? 'COORDINATOR' : '';
  const supervisors = employees.filter((employee) => employee.user.systemRoles.some((grant) => grant.systemRole.code === supervisorRole) && employee.assignments[0]?.track === trackFor(roleForForm) && employee.assignments[0]?.baseId === (destinationBaseId ? Number(destinationBaseId) : null));
  const transferCoordinators = employees.filter((employee) => employee.user.systemRoles.some((grant) => grant.systemRole.code === 'COORDINATOR') && employee.assignments[0]?.track === 'TRS' && employee.assignments[0]?.baseId === Number(selectedBaseId));
  const minesQuery = useQuery('org:mines', () => api.get<Mine[]>('/org/mines'));
  const mines = minesQuery.data ?? [];
  const selectedMine = mineDetailsId ? mines.find((mine) => mine.id === mineDetailsId) ?? null : null;
  const selectedMinePads = useQuery(mineDetailsId ? `org:mines:${mineDetailsId}:pads` : null, () => api.get<PadRow[]>(`/org/mines/${mineDetailsId}/pads`));
  const coordinators = employees.filter((employee) => employee.user.systemRoles.some((grant) => grant.systemRole.code === 'COORDINATOR'));
  const coordinatorsForMine = (mine: Mine) => coordinators.filter((employee) => employee.assignments[0]?.track === 'TRS' && employee.assignments[0]?.baseId === mine.baseId);
  const showStructure = view === 'overview' || view === 'structure';
  const showAssignmentForm = view === 'overview' || view === 'assignments' || view === 'transfers';


  const refresh = () => {
    invalidate('org:');
    invalidate('admin:');
  };

  const createMine = useAction((baseId: number) => api.post(`/org/bases/${baseId}/mines`, { name: mineName }), {
    onSuccess: () => {
      setMineName('');
      setMineDialogOpen(false);
      refresh();
    },
  });
  const savePad = useAction(async () => {
    if (!selectedMine) return;
    if (padDialog.editing) {
      await api.patch(`/org/mines/${selectedMine.id}/pads/${padDialog.editing.id}`, { name: padName.trim(), isActive: padDialog.editing.isActive });
    } else {
      await api.post(`/org/mines/${selectedMine.id}/pads`, { name: padName.trim() });
    }
  }, {
    onSuccess: () => {
      setPadDialog({ open: false, editing: null });
      setPadName('');
      selectedMinePads.reload();
      refresh();
    },
  });
  const archivePad = useAction((pad: PadRow) => api.patch(`/org/mines/${selectedMine!.id}/pads/${pad.id}`, { isActive: !pad.isActive }), {
    onSuccess: () => {
      selectedMinePads.reload();
      refresh();
    },
  });
  const assignMineCoordinator = useAction((input: { mineId: number; coordinatorEmployeeId: number; startsAt: string }) =>
    api.post(`/org/mines/${input.mineId}/coordinator`, {
      coordinatorEmployeeId: input.coordinatorEmployeeId,
      startsAt: input.startsAt,
    }), {
      onSuccess: refresh,
    });
  const assignEmployee = useAction(async () => {
    if (!selectedEmployee) throw new Error("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430");
    if (isTransfer && isAdmin && !selectedBaseId) throw new Error("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u0430\u0437\u0443 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f");
    if (isTransfer && !transferCoordinators.some((employee) => String(employee.id) === selectedSupervisorId)) throw new Error("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440\u0430 \u043f\u0440\u0438\u043d\u0438\u043c\u0430\u044e\u0449\u0435\u0439 \u0431\u0430\u0437\u044b");
    const destinationId = isTransfer || currentAssignment?.track === 'UNASSIGNED' ? (destinationBaseId ? Number(destinationBaseId) : null) : undefined;
    return api.post(`/org/employees/${selectedEmployee.id}/assignments`, {
      track: trackFor(roleForForm),
      ...(destinationId !== undefined && { baseId: destinationId }),
      positionId: selectedPositionId ? Number(selectedPositionId) : null,
      supervisorEmployeeId: selectedSupervisorId ? Number(selectedSupervisorId) : null,
      startsAt,
      reason: reason || null,
    });
  }, {
    onSuccess: () => {
      setReason('');
      setErrorMessageText('');
      refresh();
    },
    onError: (error) => setErrorMessageText(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title={view === 'assignments' || view === 'transfers' ? 'Назначения и переводы' : isAdmin ? 'Организационная структура' : 'Моя база и команда'}
        subtitle={view === 'assignments' || view === 'transfers'
          ? 'Назначайте сотрудников и оформляйте переводы с сохранением истории'
          : 'Базы и месторождения с назначениями и историей переводов'}
      />
      {(basesQuery.error || employeesQuery.error || positionsQuery.error || rolesQuery.error || minesQuery.error) && (
        <Alert>{basesQuery.error ?? employeesQuery.error ?? positionsQuery.error ?? rolesQuery.error ?? minesQuery.error}</Alert>
      )}
      {errorMessageText && <Alert>{errorMessageText}</Alert>}

      {showStructure && isAdmin && (
        <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <h2 className="section-title">Базы из справочника</h2>
          <div className="row wrap">
            {bases.map((base) => <span className="chip" key={base.id}>{base.name} · {base.code}</span>)}
          </div>
        </section>
      )}

      {view === 'overview' && (
        <section className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <h2 className="section-title">{isAdmin ? 'Карточки сотрудников и назначения' : 'Сотрудники моей зоны ответственности'}</h2>
          {isAdmin && (
            <p className="muted">`root` назначается менеджеру базы, `editor` — координатору. Назначение сотрудника не меняет его старые кадровые записи.</p>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Сотрудник</th><th>Системная роль</th><th>Должность</th><th>База / руководитель</th><th>Подразделение</th><th>Месторождения координатора</th></tr></thead>
              <tbody>
                {employees.map((employee) => {
                  const assignment = employee.assignments[0];
                  return (
                    <tr key={employee.id} className={employee.user.isActive ? '' : 'dimmed'}>
                      <td>{employee.user.fullName}<div className="muted small">{employee.user.login}</div></td>
                      <td>{employee.user.systemRoles.map((grant) => grant.systemRole.name).join(', ') || 'Сотрудник'}</td>
                      <td>{assignment?.position?.name ?? 'Не назначена'}</td>
                      <td>{assignment?.base?.name ?? 'Не назначена'}{assignment?.supervisor?.user.fullName && <div className="muted small">Руководитель: {assignment.supervisor.user.fullName}</div>}</td>
                      <td>{assignment?.track === 'UNASSIGNED' ? 'Не назначено' : assignment?.track === 'R_AND_M' ? 'R&M' : 'TRS'}</td>
                      <td>{employee.mineAssignments?.map((item) => item.mine.name).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && <div className="empty">Нет сотрудников в доступной области.</div>}
          </div>
        </section>
      )}

      {showAssignmentForm && (isAdmin || isManager) && (
          <form className="panel" style={{ padding: 16, marginTop: 18 }} onSubmit={async (event) => {
            event.preventDefault();
            setErrorMessageText('');
            await assignEmployee.run();
          }}>
            <h3 className="section-title">
                {isTransfer ? 'Оформить перевод сотрудника' : isAdmin ? 'Назначить сотрудника' : 'Перевести сотрудника внутри своей базы'}
            </h3>
              {view === 'assignments' && (
                <div className="tabs" role="tablist" aria-label="Действие с назначением">
                  <button type="button" role="tab" aria-selected={!isTransfer} className={`tab${!isTransfer ? ' active' : ''}`} onClick={() => setAssignmentTab('assignment')}>Назначение</button>
                  <button type="button" role="tab" aria-selected={isTransfer} className={`tab${isTransfer ? ' active' : ''}`} onClick={() => setAssignmentTab('transfer')}>Перевод</button>
                </div>
              )}
              {isTransfer && <p className="muted">Укажите новые условия назначения. Текущее назначение будет закрыто и сохранено в истории.</p>}
            <div className="row wrap">
              <SelectField label={isTransfer ? 'Сотрудник для перевода' : 'Сотрудник'} value={selectedEmployeeId} onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                const employee = employees.find((item) => String(item.id) === event.target.value);
                const assignment = employee?.assignments[0];
                setSelectedBaseId(assignment?.baseId ? String(assignment.baseId) : '');
                setSelectedPositionId(assignment?.positionId ? String(assignment.positionId) : '');
                setSelectedSupervisorId(assignment?.supervisorEmployeeId ? String(assignment.supervisorEmployeeId) : '');
                if (isAdmin) setSelectedRole(employee?.user.systemRoles[0]?.systemRole.code ?? 'EMPLOYEE');
              }}>
                <option value="">Выберите сотрудника</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.user.fullName} · {employee.user.login}</option>)}
              </SelectField>
              {isAdmin && isTransfer && <SelectField label="Base *" value={selectedBaseId} onChange={(event) => { setSelectedBaseId(event.target.value); setSelectedSupervisorId(''); }}>
                <option value="">Выберите базу назначения</option>
                {bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
              </SelectField>}
              {selectedEmployee && !isTransfer && <span className="muted">Current base: {currentAssignment?.base?.name ?? 'not set'}</span>}
              <SelectField label="Должность" value={selectedPositionId} onChange={(event) => setSelectedPositionId(event.target.value)}>
                <option value="">Не указана</option>
                {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
              </SelectField>
              {!isTransfer && supervisorRole && <SelectField label={"\u041d\u0435\u043f\u043e\u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0439 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c"} value={selectedSupervisorId} onChange={(event) => setSelectedSupervisorId(event.target.value)}>
                <option value="">{"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044f"}</option>
                {supervisors.map((employee) => <option key={employee.id} value={employee.id}>{employee.user.fullName}</option>)}
              </SelectField>}
              {isTransfer && <SelectField label={"\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440 \u043f\u0440\u0438\u043d\u0438\u043c\u0430\u044e\u0449\u0435\u0439 \u0431\u0430\u0437\u044b *"} value={selectedSupervisorId} disabled={!selectedBaseId} onChange={(event) => setSelectedSupervisorId(event.target.value)}>
                <option value="">{"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440\u0430 \u0431\u0430\u0437\u044b"}</option>
                {transferCoordinators.map((employee) => <option key={employee.id} value={employee.id}>{employee.user.fullName}</option>)}
              </SelectField>}
              <TextField label="Дата начала" type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              <TextField label={isTransfer ? 'Причина перевода' : 'Причина назначения или перевода'} value={reason} onChange={(event) => setReason(event.target.value)} />
              <button
                className="btn btn-primary"
                disabled={
                  assignEmployee.pending ||
                  !selectedEmployeeId ||
                  !startsAt ||
                  (!destinationBaseId) ||
                  (!!supervisorRole && !isTransfer && !selectedSupervisorId) ||
                  (isTransfer && !selectedSupervisorId)
                }
              >
                <Icon name="doneAll" small /> {isTransfer ? 'Оформить перевод' : 'Сохранить назначение'}
              </button>
            </div>
            <ActionError error={assignEmployee.error} />
          </form>
      )}

      {showStructure && <section className="panel" style={{ padding: 18 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 className="section-title">Месторождения</h2>
          {(isAdmin || isManager) && <button type="button" className="btn btn-primary" onClick={() => {
            setMineName('');
            setMineBaseId(isAdmin ? '' : String(signedInEmployee?.assignments[0]?.baseId ?? ''));
            setMineDialogOpen(true);
          }}><Icon name="add" small /> Новое месторождение</button>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Месторождение</th><th>База</th><th>Координатор</th><th>Кусты</th><th>Действия</th></tr></thead>
            <tbody>
              {mines.map((mine) => <tr key={mine.id} className="clickable" role="button" tabIndex={0} onClick={() => setMineDetailsId(mine.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMineDetailsId(mine.id); } }}>
                <td>{mine.name}</td>
                <td>{mine.base.name}</td>
                <td>{mine.coordinatorAssignments?.[0]?.coordinator.user.fullName ?? 'Не назначен'}</td>
                <td>{mine._count?.pads ?? 0}</td>
                <td><button type="button" className="btn btn-sm" onClick={(event) => { event.stopPropagation(); setMineDetailsId(mine.id); }}>Открыть</button></td>
              </tr>)}
            </tbody>
          </table>
          {mines.length === 0 && <div className="empty">Месторождения пока не созданы или не назначены вашей роли.</div>}
        </div>
        <ActionError error={createMine.error} />
      </section>}

      <Dialog
        open={mineDialogOpen}
        title="Новое месторождение"
        onClose={() => setMineDialogOpen(false)}
        onSubmit={() => {
          const baseId = isAdmin ? Number(mineBaseId) : signedInEmployee?.assignments[0]?.baseId;
          if (baseId) createMine.run(baseId);
        }}
        actions={<><button type="button" className="btn" onClick={() => setMineDialogOpen(false)}>Отмена</button><button type="submit" className="btn btn-primary" disabled={createMine.pending || !mineName.trim() || (isAdmin && !mineBaseId)}>Создать</button></>}
      >
        {isAdmin && <SelectField label="База *" value={mineBaseId} onChange={(event) => setMineBaseId(event.target.value)}>
          <option value="">Выберите базу</option>
          {bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
        </SelectField>}
        <TextField label="Название месторождения *" value={mineName} onChange={(event) => setMineName(event.target.value)} />
        <ActionError error={createMine.error} />
      </Dialog>

      <Dialog
        open={!!mineDetailsId}
        wide
        title={selectedMine ? `Месторождение: ${selectedMine.name}` : 'Месторождение'}
        onClose={() => setMineDetailsId(null)}
        actions={<button type="button" className="btn" onClick={() => setMineDetailsId(null)}>Закрыть</button>}
      >
        {selectedMine && <div className="stack">
          <section className="panel pad">
            <div className="row wrap">
              <span className="muted">База: {selectedMine.base.name}</span>
              <span className="muted">Текущий координатор: {selectedMine.coordinatorAssignments?.[0]?.coordinator.user.fullName ?? 'Не назначен'}</span>
            </div>
            {(isAdmin || isManager) && <div className="row wrap" style={{ marginTop: 8 }}>
              <SelectField label="Координатор проекта" value={coordinatorByMine[selectedMine.id] ?? ''} onChange={(event) => setCoordinatorByMine((state) => ({ ...state, [selectedMine.id]: event.target.value }))}>
                <option value="">Выберите координатора</option>
                {coordinatorsForMine(selectedMine).map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.user.fullName}</option>)}
              </SelectField>
              <TextField label="Дата назначения" type="date" value={transferDateByMine[selectedMine.id] ?? today()} onChange={(event) => setTransferDateByMine((state) => ({ ...state, [selectedMine.id]: event.target.value }))} />
              <button
                type="button"
                className="btn"
                disabled={assignMineCoordinator.pending || !coordinatorsForMine(selectedMine).some((coordinator) => String(coordinator.id) === (coordinatorByMine[selectedMine.id] ?? ''))}
                onClick={() => assignMineCoordinator.run({ mineId: selectedMine.id, coordinatorEmployeeId: Number(coordinatorByMine[selectedMine.id]), startsAt: transferDateByMine[selectedMine.id] ?? today() })}
              >Назначить координатора</button>
            </div>}
            <ActionError error={assignMineCoordinator.error} />
          </section>

          <section className="panel pad">
            <div className="row between wrap">
              <h3>Кусты</h3>
              <div className="row wrap">
                <button type="button" className={`btn btn-sm${!showArchivedPads ? ' btn-primary' : ''}`} onClick={() => setShowArchivedPads(false)}>Активные</button>
                <button type="button" className={`btn btn-sm${showArchivedPads ? ' btn-primary' : ''}`} onClick={() => setShowArchivedPads(true)}>Архив</button>
                {(isAdmin || isManager) && <button type="button" className="btn btn-sm" onClick={() => { setPadName(''); setPadDialog({ open: true, editing: null }); }}>Добавить</button>}
              </div>
            </div>
            {selectedMinePads.error && <Alert>{selectedMinePads.error}</Alert>}
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Название</th><th>Скважины</th><th>Статус</th>{(isAdmin || isManager) && <th>Действия</th>}</tr></thead>
                <tbody>
                  {(selectedMinePads.data ?? []).filter((pad) => showArchivedPads ? !pad.isActive : pad.isActive).map((pad) => <tr key={pad.id}>
                    <td>{pad.name}</td>
                    <td>{pad._count?.wells ?? 0}</td>
                    <td>{pad.isActive ? 'Активен' : 'В архиве'}</td>
                    {(isAdmin || isManager) && <td className="row wrap">
                      <button type="button" className="btn btn-sm" onClick={() => { setPadName(pad.name); setPadDialog({ open: true, editing: pad }); }}>Изменить</button>
                      <button type="button" className="btn btn-sm" disabled={archivePad.pending} onClick={() => archivePad.run(pad)}>{pad.isActive ? 'В архив' : 'Вернуть'}</button>
                    </td>}
                  </tr>)}
                </tbody>
              </table>
              {(selectedMinePads.data ?? []).filter((pad) => showArchivedPads ? !pad.isActive : pad.isActive).length === 0 && <div className="empty">{showArchivedPads ? 'Архивных кустов нет.' : 'Кусты не добавлены.'}</div>}
            </div>
            <ActionError error={savePad.error ?? archivePad.error} />
          </section>
        </div>}
      </Dialog>

      <Dialog
        open={padDialog.open}
        title={padDialog.editing ? 'Изменить куст' : 'Новый куст'}
        onClose={() => setPadDialog({ open: false, editing: null })}
        onSubmit={() => savePad.run()}
        actions={<><button type="button" className="btn" onClick={() => setPadDialog({ open: false, editing: null })}>Отмена</button><button type="submit" className="btn btn-primary" disabled={savePad.pending || !padName.trim()}>Сохранить</button></>}
      >
        <TextField label="Название куста *" value={padName} onChange={(event) => setPadName(event.target.value)} />
        <ActionError error={savePad.error} />
      </Dialog>
    </>
  );
}
