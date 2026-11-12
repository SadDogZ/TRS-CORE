import { useMemo, useState } from 'react';
import { api } from '../../core/api.ts';
import { useCurrentUser } from '../../core/auth.tsx';
import { invalidate, useAction, useQuery } from '../../core/data.ts';
import { Alert, Dialog, PageHeader, SearchInput, SelectField, TextArea, TextField } from '../../../../../shared/ui/index.ts';
import { ActionError } from '../../widgets/feedback/ActionError';
import { SearchableSelectWithCreate } from './SearchableSelectWithCreate.tsx';

interface DirectoryRow {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  comments: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  objectsCount: number;
  contractsCount: number;
}

interface Representative {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  comments: string | null;
}

interface CustomerObject {
  id: number;
  name: string;
  relationship: string;
  comments: string | null;
  status: string;
  isActive: boolean;
  base: { id: number; name: string };
  contract: { id: number; number: string } | null;
  coordinatorAssignments: { coordinator: { user: { fullName: string } } }[];
}

interface CustomerDetails {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  comments: string | null;
  isActive: boolean;
  representatives: Representative[];
  contracts: { id: number; number: string; status: { name: string; code?: string }; base: { id: number; name: string } }[];
  objects: CustomerObject[];
}

interface BaseOption {
  id: number;
  name: string;
}

interface ContractStatusOption {
  id: number;
  name: string;
  code?: string;
}

interface EmployeeOption {
  id: number;
  user: { systemRoles: { systemRole: { code: string } }[]; fullName: string };
  assignments: { baseId: number | null; activeEmployeeId: number | null }[];
}

const today = () => new Date().toISOString().slice(0, 10);

const HINT_REQUIRED_ORGANIZATION_NAME = 'Обязательное поле: укажите официальное наименование заказчика (как в договоре/карточке контрагента).';
const HINT_REQUIRED_REPRESENTATIVE_NAME = 'Обязательное поле: ФИО представителя заказчика для контакта и истории коммуникаций.';
const HINT_RELATIONSHIP = 'Укажите роль или отношение к заказчику: например, филиал, подрядчик, представитель, владелец площадки, заказчик работ.';
const HINT_REQUIRED_OBJECT_NAME = 'Обязательное поле: уникальное название объекта заказчика в пределах базы.';
const HINT_REQUIRED_CONTRACT_BASE = 'Обязательное поле: база, к которой будет привязан договор.';
const HINT_REQUIRED_CONTRACT_STATUS = 'Обязательное поле: стартовый статус договора (обычно Черновик или Действует).';
const HINT_REQUIRED_CONTRACT_NUMBER = 'Обязательное поле: номер договора в формате, принятом у заказчика/компании.';

export function CustomerDirectoryPage() {
  const user = useCurrentUser();
  const canArchiveContracts = user.systemRoles.includes('ADMIN') || user.systemRoles.includes('MANAGER');
  const [search, setSearch] = useState('');
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [showArchivedContracts, setShowArchivedContracts] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState('');
  const [customerDialog, setCustomerDialog] = useState<{ open: boolean; editing: DirectoryRow | null }>({ open: false, editing: null });
  const [repDialog, setRepDialog] = useState<{ open: boolean; editing: Representative | null }>({ open: false, editing: null });
  const [objectDialog, setObjectDialog] = useState<{ open: boolean; editing: CustomerObject | null }>({ open: false, editing: null });
  const [coordDialog, setCoordDialog] = useState<{ open: boolean; objectId: number | null }>({ open: false, objectId: null });
  const [contractDialogOpen, setContractDialogOpen] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerComments, setCustomerComments] = useState('');

  const [repName, setRepName] = useState('');
  const [repPhone, setRepPhone] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repRelationship, setRepRelationship] = useState('');
  const [repComments, setRepComments] = useState('');

  const [objectName, setObjectName] = useState('');
  const [objectRelationship, setObjectRelationship] = useState('');
  const [objectContractId, setObjectContractId] = useState('');
  const [objectStatus, setObjectStatus] = useState('ACTIVE');
  const [objectComments, setObjectComments] = useState('');

  const [coordinatorId, setCoordinatorId] = useState('');
  const [coordinatorDate, setCoordinatorDate] = useState(today());
  const [coordinatorComment, setCoordinatorComment] = useState('');

  const [newContractBaseId, setNewContractBaseId] = useState('');
  const [newContractStatusId, setNewContractStatusId] = useState('');
  const [newContractNumber, setNewContractNumber] = useState('');
  const [newContractStartsAt, setNewContractStartsAt] = useState(today());
  const [newContractEndsAt, setNewContractEndsAt] = useState(today());

  const directory = useQuery(`org:customers:directory:${search.trim().toLowerCase()}`, () => api.get<DirectoryRow[]>('/org/customers/directory', { search }));
  const details = useQuery(detailsId ? `org:customers:details:${detailsId}` : null, () => api.get<CustomerDetails>(`/org/customers/${detailsId}/details`));
  const employees = useQuery(coordDialog.open ? 'org:customers:employees' : null, () => api.get<EmployeeOption[]>('/org/employees'));
  const bases = useQuery(contractDialogOpen ? 'org:customers:bases' : null, () => api.get<BaseOption[]>('/org/bases'));
  const contractStatuses = useQuery(contractDialogOpen ? 'org:customers:contract-statuses' : null, () => api.get<ContractStatusOption[]>('/org/statuses/contract'));

  const coordinators = useMemo(() => {
    const object = details.data?.objects.find((item) => item.id === coordDialog.objectId);
    if (!object) return [];
    return (employees.data ?? []).filter((employee) =>
      employee.user.systemRoles.some((grant) => grant.systemRole.code === 'COORDINATOR')
      && employee.assignments.some((assignment) => assignment.activeEmployeeId !== null && assignment.baseId === object.base.id),
    );
  }, [employees.data, details.data, coordDialog.objectId]);

  const resetCustomerForm = () => {
    setCustomerName('');
    setCustomerCode('');
    setCustomerAddress('');
    setCustomerComments('');
  };

  const openCreateCustomer = () => {
    resetCustomerForm();
    setCustomerDialog({ open: true, editing: null });
  };

  const openEditCustomer = (row: DirectoryRow) => {
    setCustomerName(row.name);
    setCustomerCode(row.code ?? '');
    setCustomerAddress(row.address ?? '');
    setCustomerComments(row.comments ?? '');
    setCustomerDialog({ open: true, editing: row });
  };

  const openCreateRepresentative = () => {
    setRepName('');
    setRepPhone('');
    setRepEmail('');
    setRepRelationship('');
    setRepComments('');
    setRepDialog({ open: true, editing: null });
  };

  const openEditRepresentative = (item: Representative) => {
    setRepName(item.fullName);
    setRepPhone(item.phone ?? '');
    setRepEmail(item.email ?? '');
    setRepRelationship(item.relationship ?? '');
    setRepComments(item.comments ?? '');
    setRepDialog({ open: true, editing: item });
  };

  const openCreateObject = () => {
    setObjectName('');
    setObjectRelationship('');
    setObjectContractId('');
    setObjectStatus('ACTIVE');
    setObjectComments('');
    setObjectDialog({ open: true, editing: null });
  };

  const openCreateContract = () => {
    const defaultBaseId =
      details.data?.contracts[0]?.base.id
      ?? details.data?.objects[0]?.base.id
      ?? null;
    setNewContractBaseId(defaultBaseId ? String(defaultBaseId) : '');
    setNewContractStatusId('');
    setNewContractNumber('');
    setNewContractStartsAt(today());
    setNewContractEndsAt(today());
    setContractDialogOpen(true);
  };

  const openEditObject = (item: CustomerObject) => {
    setObjectName(item.name);
    setObjectRelationship(item.relationship);
    setObjectContractId(item.contract ? String(item.contract.id) : '');
    setObjectStatus(item.status);
    setObjectComments(item.comments ?? '');
    setObjectDialog({ open: true, editing: item });
  };

  const saveCustomer = useAction(async () => {
    const payload = {
      name: customerName,
      code: customerCode || null,
      address: customerAddress || null,
      comments: customerComments || null,
      ...(customerDialog.editing ? { isActive: customerDialog.editing.status === 'ACTIVE' } : {}),
    };
    if (customerDialog.editing) {
      await api.patch(`/org/customers/${customerDialog.editing.id}`, payload);
    } else {
      await api.post('/org/customers', payload);
    }
  }, {
    onSuccess: () => {
      setCustomerDialog({ open: false, editing: null });
      invalidate('org:customers:');
      directory.reload();
      if (detailsId) details.reload();
    },
  });

  const saveRepresentative = useAction(async () => {
    if (!detailsId) return;
    const payload = {
      fullName: repName,
      phone: repPhone || null,
      email: repEmail || null,
      relationship: repRelationship || null,
      comments: repComments || null,
    };
    if (repDialog.editing) {
      await api.patch(`/org/customers/${detailsId}/representatives/${repDialog.editing.id}`, payload);
    } else {
      await api.post(`/org/customers/${detailsId}/representatives`, payload);
    }
  }, {
    onSuccess: () => {
      setRepDialog({ open: false, editing: null });
      setRepName('');
      setRepPhone('');
      setRepEmail('');
      setRepRelationship('');
      setRepComments('');
      if (detailsId) details.reload();
      invalidate('org:customers:');
    },
  });

  const saveObject = useAction(async () => {
    if (!detailsId) return;
    const payload = {
      name: objectName,
      relationship: objectRelationship,
      contractId: objectContractId ? Number(objectContractId) : null,
      comments: objectComments || null,
      status: objectStatus,
      isActive: objectStatus !== 'ARCHIVED',
    };
    if (objectDialog.editing) {
      await api.patch(`/org/customers/${detailsId}/objects/${objectDialog.editing.id}`, payload);
    } else {
      await api.post(`/org/customers/${detailsId}/objects`, payload);
    }
  }, {
    onSuccess: () => {
      setObjectDialog({ open: false, editing: null });
      setObjectName('');
      setObjectRelationship('');
      setObjectContractId('');
      setObjectStatus('ACTIVE');
      setObjectComments('');
      if (detailsId) details.reload();
      invalidate('org:customers:');
    },
  });

  const assignCoordinator = useAction(async () => {
    if (!coordDialog.objectId) return;
    await api.post(`/org/customer-objects/${coordDialog.objectId}/coordinator-assignments`, {
      coordinatorEmployeeId: Number(coordinatorId),
      startsAt: coordinatorDate,
      comment: coordinatorComment || null,
    });
  }, {
    onSuccess: () => {
      setCoordDialog({ open: false, objectId: null });
      setCoordinatorId('');
      setCoordinatorDate(today());
      setCoordinatorComment('');
      if (detailsId) details.reload();
    },
  });

  const createContract = useAction(async () => {
    if (!detailsId || !newContractBaseId || !newContractStatusId || !newContractNumber.trim()) return;
    const created = await api.post<{ id: number }>(`/org/bases/${newContractBaseId}/contracts`, {
      customerId: detailsId,
      statusId: Number(newContractStatusId),
      number: newContractNumber.trim(),
      startsAt: newContractStartsAt,
      endsAt: newContractEndsAt,
    });
    setObjectContractId(String(created.id));
  }, {
    onSuccess: () => {
      setContractDialogOpen(false);
      if (detailsId) details.reload();
      invalidate('org:customers:');
    },
  });

  const archiveContract = useAction(async (contractId: number) => {
    const result = await api.post<{ hadOpenWork?: boolean }>(`/org/contracts/${contractId}/archive`);
    setArchiveNotice(result.hadOpenWork
      ? 'Договор архивирован. Незавершённые и запланированные работы сохранены и остаются в истории.'
      : 'Договор архивирован и скрыт из списков для новых работ.');
    return result;
  }, {
    onSuccess: () => {
      if (detailsId) details.reload();
      invalidate('org:customers:');
    },
  });

  const activeContractStatuses = useMemo(
    () => (contractStatuses.data ?? []).filter((item) => item.code !== 'CLOSED' && item.code !== 'ARCHIVED'),
    [contractStatuses.data],
  );

  const visibleContracts = useMemo(
    () => (details.data?.contracts ?? []).filter((item) => showArchivedContracts ? item.status.code === 'ARCHIVED' : item.status.code !== 'ARCHIVED'),
    [details.data?.contracts, showArchivedContracts],
  );

  const activeContracts = useMemo(
    () => (details.data?.contracts ?? []).filter((item) => item.status.code !== 'ARCHIVED'),
    [details.data?.contracts],
  );

  return (
    <>
      <PageHeader
        title="Справочник заказчиков"
        subtitle="Табличный режим с карточкой заказчика, представителями, договорами и объектами"
        actions={<button type="button" className="btn btn-primary" onClick={openCreateCustomer}>Новый заказчик</button>}
      />

      {directory.error && <Alert>{directory.error}</Alert>}

      <section className="panel pad stack">
        <SearchInput value={search} onChange={setSearch} placeholder="Поиск по заказчику, коду, адресу" />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Заказчик</th><th>Объекты</th><th>Договоры</th><th>Статус</th><th>Действия</th></tr>
            </thead>
            <tbody>
              {(directory.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}<div className="muted small">{row.address ?? 'Адрес не указан'}</div></td>
                  <td>{row.objectsCount}</td>
                  <td>{row.contractsCount}</td>
                  <td>{row.status === 'ACTIVE' ? 'Активен' : 'Архив'}</td>
                  <td className="row wrap">
                    <button type="button" className="btn btn-sm" onClick={() => setDetailsId(row.id)}>Открыть</button>
                    <button type="button" className="btn btn-sm" onClick={() => openEditCustomer(row)}>Изменить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {directory.data?.length === 0 && <div className="empty">Заказчики не найдены.</div>}
        </div>
      </section>

      <Dialog open={!!detailsId} wide title={details.data ? `Заказчик: ${details.data.name}` : 'Карточка заказчика'} onClose={() => setDetailsId(null)} actions={<button type="button" className="btn" onClick={() => setDetailsId(null)}>Закрыть</button>}>
        {details.error && <Alert>{details.error}</Alert>}
        {details.data && <div className="stack">
          <section className="panel pad">
            <h3>Информация</h3>
            <div className="muted">{details.data.address ?? 'Адрес не указан'}</div>
            {details.data.comments && <div className="muted">{details.data.comments}</div>}
          </section>

          <section className="panel pad">
            <div className="row between"><h3>Представители</h3><button type="button" className="btn btn-sm" onClick={openCreateRepresentative}>Добавить</button></div>
            <ul className="stack tight">
              {details.data.representatives.map((item) => <li key={item.id} className="row between wrap"><span>{item.fullName} · {item.phone ?? 'телефон не указан'} · {item.email ?? 'email не указан'}</span><button type="button" className="btn btn-sm" onClick={() => openEditRepresentative(item)}>Изменить</button></li>)}
              {details.data.representatives.length === 0 && <li className="muted">Пока нет представителей.</li>}
            </ul>
          </section>

          <section className="panel pad">
            <div className="row between wrap">
              <h3>Договоры</h3>
              <div className="row wrap">
                <button type="button" className={`btn btn-sm${!showArchivedContracts ? ' btn-primary' : ''}`} onClick={() => setShowArchivedContracts(false)}>Активные</button>
                <button type="button" className={`btn btn-sm${showArchivedContracts ? ' btn-primary' : ''}`} onClick={() => setShowArchivedContracts(true)}>Архив</button>
              </div>
            </div>
            <ul className="stack tight">
              {visibleContracts.map((item) => <li key={item.id} className="row between wrap"><span>{item.number} · {item.status.name} · {item.base.name}</span>{canArchiveContracts && item.status.code !== 'ARCHIVED' && <button type="button" className="btn btn-sm" disabled={archiveContract.pending} onClick={() => { if (window.confirm(`Архивировать договор ${item.number}? Запись, допсоглашения и выполненные работы сохранятся. Договор пропадёт из списков для новых работ.`)) archiveContract.run(item.id); }}>В архив</button>}</li>)}
              {archiveNotice && <li className="muted">{archiveNotice}</li>}
              {visibleContracts.length === 0 && <li className="muted">{showArchivedContracts ? 'Архивных договоров нет.' : 'Активных договоров нет.'}</li>}
            </ul>
            <ActionError error={archiveContract.error} />
          </section>

          <section className="panel pad">
            <div className="row between"><h3>Объекты заказчика</h3><button type="button" className="btn btn-sm" onClick={openCreateObject}>Добавить</button></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Объект</th><th>Связь с заказчиком</th><th>Договор</th><th>Координатор</th><th>Статус</th><th>Действия</th></tr></thead>
                <tbody>
                  {details.data.objects.map((item) => <tr key={item.id}>
                    <td>{item.name}<div className="muted small">{item.base.name}</div></td>
                    <td>{item.relationship}</td>
                    <td>{item.contract?.number ?? '—'}</td>
                    <td>{item.coordinatorAssignments[0]?.coordinator.user.fullName ?? 'Не назначен'}</td>
                    <td>{item.status}</td>
                    <td className="row wrap"><button type="button" className="btn btn-sm" onClick={() => openEditObject(item)}>Изменить</button><button type="button" className="btn btn-sm" onClick={() => setCoordDialog({ open: true, objectId: item.id })}>Назначить координатора</button></td>
                  </tr>)}
                </tbody>
              </table>
              {details.data.objects.length === 0 && <div className="empty">Объекты не созданы.</div>}
            </div>
          </section>
        </div>}
      </Dialog>

      <Dialog open={customerDialog.open} title={customerDialog.editing ? 'Изменить заказчика' : 'Новый заказчик'} onClose={() => setCustomerDialog({ open: false, editing: null })} onSubmit={() => saveCustomer.run()} actions={<><button type="button" className="btn" onClick={() => setCustomerDialog({ open: false, editing: null })}>Отмена</button><button type="submit" className="btn btn-primary" disabled={saveCustomer.pending || !customerName.trim()}>Сохранить</button></>}>
        <TextField label="Название организации *" hoverHint={HINT_REQUIRED_ORGANIZATION_NAME} title={HINT_REQUIRED_ORGANIZATION_NAME} value={customerName} onChange={(event: any) => setCustomerName(event.target.value)} />
        <TextField label="Код" value={customerCode} onChange={(event: any) => setCustomerCode(event.target.value)} />
        <TextField label="Адрес" value={customerAddress} onChange={(event: any) => setCustomerAddress(event.target.value)} />
        <TextArea label="Комментарии" rows={3} value={customerComments} onChange={(event: any) => setCustomerComments(event.target.value)} />
        <ActionError error={saveCustomer.error} />
      </Dialog>

      <Dialog open={repDialog.open} title={repDialog.editing ? 'Изменить представителя' : 'Новый представитель'} onClose={() => setRepDialog({ open: false, editing: null })} onSubmit={() => saveRepresentative.run()} actions={<><button type="button" className="btn" onClick={() => setRepDialog({ open: false, editing: null })}>Отмена</button><button type="submit" className="btn btn-primary" disabled={saveRepresentative.pending || !repName.trim()}>Сохранить</button></>}>
        <TextField label="ФИО *" hoverHint={HINT_REQUIRED_REPRESENTATIVE_NAME} title={HINT_REQUIRED_REPRESENTATIVE_NAME} value={repName} onChange={(event: any) => setRepName(event.target.value)} />
        <TextField label="Телефон" value={repPhone} onChange={(event: any) => setRepPhone(event.target.value)} />
        <TextField label="Email" value={repEmail} onChange={(event: any) => setRepEmail(event.target.value)} />
        <TextField label="Связь с заказчиком" hoverHint={HINT_RELATIONSHIP} title={HINT_RELATIONSHIP} value={repRelationship} onChange={(event: any) => setRepRelationship(event.target.value)} />
        <TextArea label="Комментарий" rows={3} value={repComments} onChange={(event: any) => setRepComments(event.target.value)} />
        <ActionError error={saveRepresentative.error} />
      </Dialog>

      <Dialog open={objectDialog.open} title={objectDialog.editing ? 'Изменить объект заказчика' : 'Новый объект заказчика'} onClose={() => setObjectDialog({ open: false, editing: null })} onSubmit={() => saveObject.run()} actions={<><button type="button" className="btn" onClick={() => setObjectDialog({ open: false, editing: null })}>Отмена</button><button type="submit" className="btn btn-primary" disabled={saveObject.pending || !objectName.trim() || !objectRelationship.trim()}>Сохранить</button></>}>
        <TextField label="Название объекта *" hoverHint={HINT_REQUIRED_OBJECT_NAME} title={HINT_REQUIRED_OBJECT_NAME} value={objectName} onChange={(event: any) => setObjectName(event.target.value)} />
        <TextField label="Связь с заказчиком *" hoverHint={HINT_RELATIONSHIP} title={HINT_RELATIONSHIP} value={objectRelationship} onChange={(event: any) => setObjectRelationship(event.target.value)} />
        <SearchableSelectWithCreate
          label="Договор"
          value={objectContractId}
          onChange={setObjectContractId}
          options={activeContracts.map((item) => ({ id: item.id, label: `${item.number} · ${item.status.name}` }))}
          onCreate={openCreateContract}
          createTitle="Создать договор"
        />
        <SelectField label="Статус" value={objectStatus} onChange={(event: any) => setObjectStatus(event.target.value)}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PAUSED">PAUSED</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </SelectField>
        <TextArea label="Комментарии" rows={3} value={objectComments} onChange={(event: any) => setObjectComments(event.target.value)} />
        <ActionError error={saveObject.error} />
      </Dialog>

      <Dialog open={coordDialog.open} title="Назначение координатора объекта" onClose={() => setCoordDialog({ open: false, objectId: null })} onSubmit={() => assignCoordinator.run()} actions={<><button type="button" className="btn" onClick={() => setCoordDialog({ open: false, objectId: null })}>Отмена</button><button type="submit" className="btn btn-primary" disabled={assignCoordinator.pending || !coordinatorId}>Назначить</button></>}>
        <SearchableSelectWithCreate
          label="Координатор"
          value={coordinatorId}
          onChange={setCoordinatorId}
          options={coordinators.map((item) => ({ id: item.id, label: item.user.fullName }))}
        />
        <TextField label="Дата начала" type="date" value={coordinatorDate} onChange={(event: any) => setCoordinatorDate(event.target.value)} />
        <TextArea label="Комментарий" rows={3} value={coordinatorComment} onChange={(event: any) => setCoordinatorComment(event.target.value)} />
        <ActionError error={assignCoordinator.error} />
      </Dialog>

      <Dialog open={contractDialogOpen} title="Новый договор" onClose={() => setContractDialogOpen(false)} onSubmit={() => createContract.run()} actions={<><button type="button" className="btn" onClick={() => setContractDialogOpen(false)}>Отмена</button><button type="submit" className="btn btn-primary" disabled={createContract.pending || !newContractBaseId || !newContractStatusId || !newContractNumber.trim()}>Сохранить</button></>}>
        <SelectField label="База *" hoverHint={HINT_REQUIRED_CONTRACT_BASE} title={HINT_REQUIRED_CONTRACT_BASE} value={newContractBaseId} onChange={(event: any) => setNewContractBaseId(event.target.value)}>
          <option value="">Выберите базу</option>
          {(bases.data ?? []).map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Статус *" hoverHint={HINT_REQUIRED_CONTRACT_STATUS} title={HINT_REQUIRED_CONTRACT_STATUS} value={newContractStatusId} onChange={(event: any) => setNewContractStatusId(event.target.value)}>
          <option value="">Выберите статус</option>
          {activeContractStatuses.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
        </SelectField>
        <TextField label="Номер договора *" hoverHint={HINT_REQUIRED_CONTRACT_NUMBER} title={HINT_REQUIRED_CONTRACT_NUMBER} value={newContractNumber} onChange={(event: any) => setNewContractNumber(event.target.value)} />
        <TextField label="Дата начала" type="date" value={newContractStartsAt} onChange={(event: any) => setNewContractStartsAt(event.target.value)} />
        <TextField label="Дата окончания" type="date" value={newContractEndsAt} onChange={(event: any) => setNewContractEndsAt(event.target.value)} />
        <ActionError error={createContract.error} />
      </Dialog>
    </>
  );
}
