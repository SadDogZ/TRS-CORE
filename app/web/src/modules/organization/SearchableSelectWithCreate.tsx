import { useMemo, useState } from 'react';
import { SelectField, TextField } from '../../../../../shared/ui/index.ts';

interface Option {
  id: number;
  label: string;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  createTitle?: string;
  onCreate?: () => void;
}

export function SearchableSelectWithCreate({
  label,
  value,
  onChange,
  options,
  placeholder = 'Поиск…',
  disabled,
  createTitle = 'Добавить',
  onCreate,
}: Props) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((item) => item.label.toLowerCase().includes(term));
  }, [options, search]);

  return (
    <div className="stack tight">
      <TextField label={`${label} — поиск`} value={search} placeholder={placeholder} onChange={(event: any) => setSearch(event.target.value)} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <SelectField label={label} value={value} disabled={disabled} onChange={(event: any) => onChange(event.target.value)}>
            <option value="">Выберите значение</option>
            {filtered.map((item) => <option key={item.id} value={String(item.id)}>{item.label}</option>)}
          </SelectField>
        </div>
        {onCreate && <button type="button" className="btn" title={createTitle} onClick={onCreate}>+</button>}
      </div>
    </div>
  );
}
