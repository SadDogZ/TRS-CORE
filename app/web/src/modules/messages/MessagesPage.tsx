import { useEffect, useState } from 'react';
import { sendMessageSchema, type MessageDto, type Paginated } from '@app/shared';
import { api, errorMessage } from '../../core/api.ts';
import { Icon, Alert, PageHeader, Pager, SelectField, TextArea, TextField } from '@app/shared/ui';
import { invalidate, useAction, useQuery } from '../../core/data.ts';
import { useForm } from '../../core/form.ts';
import { useCurrentUser } from '../../core/auth.tsx';
import { formatDateTime } from '../../core/utils.ts';
import { takeMessageDraft } from './messageDraft.ts';

interface UserOption {
  id: number;
  fullName: string;
  login: string;
}

export function MessagesPage() {
  const me = useCurrentUser();
  const isAdmin = me.systemRoles.includes('ADMIN');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [peerId, setPeerId] = useState('');
  const form = useForm({ recipient: 'user', userId: '', subject: '', body: '' });
  const { reset } = form;

  useEffect(() => {
    const draft = takeMessageDraft();
    if (draft) {
      reset({ recipient: 'user', userId: String(draft.userId), subject: draft.subject, body: draft.body });
      setPeerId(String(draft.userId));
    }
  }, [reset]);

  const options = useQuery('messages:recipients', () => api.get<UserOption[]>('/me/messages/recipients'), {
    refreshMs: 30_000,
  });
  const history = useQuery(
    `messages:list:${page}:${pageSize}:${peerId}`,
    () =>
      api.get<Paginated<MessageDto>>('/me/messages', {
        page,
        pageSize,
        ...(peerId ? { peerId: Number(peerId) } : {}),
      }),
    { refreshMs: 12_000 },
  );
  const unread = useQuery('messages:unread', () => api.get<{ count: number }>('/me/messages/unread-count'), {
    refreshMs: 12_000,
  });

  const send = useAction((data: unknown) => api.post<{ recipientsCount: number }>('/me/messages', data), {
    onSuccess: () => {
      form.reset({ ...form.values, subject: '', body: '' });
      invalidate('messages');
      invalidate('notifications');
    },
    onError: (err) => form.applyServerErrors(err),
  });
  const [sentTo, setSentTo] = useState<number | null>(null);

  const submit = async () => {
    const { recipient, userId, subject, body } = form.values;
    const payload = { recipient, subject, body, ...(recipient === 'user' && userId && { userId: Number(userId) }) };
    if (!form.validate(sendMessageSchema, payload)) return;
    setSentTo(null);
    const ok = await send.run(payload);
    if (ok) setSentTo(recipient === 'all' ? -1 : Number(userId));
  };

  return (
    <>
      <PageHeader
        title="Сообщения"
        subtitle={
          unread.data?.count
            ? `Непрочитанных входящих: ${unread.data.count}. Переписка сохраняется в истории.`
            : 'Личные сообщения в пределах вашей организационной зоны'
        }
      />
      <div className="half-cols">
        <form
          noValidate
          className="panel pad-lg stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="bold">Новое сообщение</div>
          {isAdmin && (
            <div className="row wrap" role="radiogroup" aria-label="Получатель" style={{ gap: 16 }}>
              {[
                ['user', 'Конкретный сотрудник'],
                ['all', 'Все сотрудники'],
              ].map(([value, label]) => (
                <label key={value} className="check">
                  <input type="radio" name="recipient" value={value} checked={form.values.recipient === value} onChange={() => form.set('recipient', value)} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {form.values.recipient === 'user' || !isAdmin ? (
            <SelectField label="Получатель" {...form.field('userId')}>
              <option value="">— выберите сотрудника —</option>
              {options.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.fullName} ({option.login})
                </option>
              ))}
            </SelectField>
          ) : (
            <Alert kind="info">Сообщение получат все активные сотрудники.</Alert>
          )}
          <TextField label="Тема" {...form.field('subject')} />
          <TextArea label="Сообщение" rows={6} {...form.field('body')} />
          {send.done && sentTo !== null && <Alert kind="success">Сообщение отправлено</Alert>}
          {send.error && !Object.values(form.errors).some(Boolean) ? <Alert>{errorMessage(send.error)}</Alert> : null}
          <div>
            <button type="submit" className="btn btn-primary" disabled={send.pending}>
              <Icon name="send" small /> Отправить
            </button>
          </div>
        </form>

        <div className="panel pad">
          <div className="row between wrap" style={{ marginBottom: 8 }}>
            <div className="panel-title" style={{ margin: 0 }}>История</div>
            <SelectField
              label="Диалог"
              value={peerId}
              onChange={(event) => {
                setPeerId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Все сообщения</option>
              {options.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.fullName}
                </option>
              ))}
            </SelectField>
          </div>
          {history.error && <Alert>{history.error}</Alert>}
          {history.loading && !history.data && <div className="muted">Загрузка…</div>}
          {history.data?.items.length === 0 && <div className="muted">Сообщений пока нет</div>}
          <ul className="list">
            {history.data?.items.map((message) => (
              <li key={message.id}>
                <div className="row wrap">
                  <span className="bold">{message.subject}</span>
                  <span className="chip small">
                    {message.isBroadcast ? 'Всем' : message.sender.id === me.id ? `→ ${message.recipient?.fullName ?? '—'}` : `← ${message.sender.fullName}`}
                  </span>
                </div>
                <div className="pre" style={{ margin: '4px 0' }}>
                  {message.body}
                </div>
                <div className="muted small">
                  {formatDateTime(message.createdAt)} · {message.sender.fullName}
                  {message.isBroadcast || message.sender.id === me.id
                    ? ` · прочитали ${message.readCount} из ${message.recipientsCount}`
                    : ''}
                </div>
              </li>
            ))}
          </ul>
          {history.data && history.data.total > pageSize && (
            <Pager
              total={history.data.total}
              page={page}
              pageSize={pageSize}
              sizes={[10, 20, 50]}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
