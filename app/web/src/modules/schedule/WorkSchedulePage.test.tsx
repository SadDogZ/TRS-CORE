import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkSchedulePage } from './WorkSchedulePage.tsx';
import { useCurrentUser } from '../../core/auth.tsx';
import { api } from '../../core/api.ts';

vi.mock('../../core/auth.tsx', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../../core/router.tsx', () => ({
  useRouter: () => ({ search: new URLSearchParams('userId=5'), navigate: vi.fn() }),
}));
vi.mock('../../core/api.ts', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (error: unknown) => String(error),
}));
vi.mock('../../core/i18n.tsx', () => ({
  useLanguage: () => ({ language: 'ru' }),
}));

function setup(roles: Array<'ADMIN' | 'MANAGER' | 'COORDINATOR' | 'EMPLOYEE'> = ['MANAGER']) {
  vi.mocked(useCurrentUser).mockReturnValue({
    id: 1,
    fullName: 'Manager',
    login: 'manager',
    systemRoles: roles,
    positionId: null,
    position: null,
    phone: null,
    email: null,
    photoMime: null,
    photoFile: null,
    isActive: true,
    mustChangePassword: false,
    uiSettings: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/me/work-schedule/users') return [{ id: 5, fullName: 'Employee', login: 'emp' }] as never;
    if (path === '/me/work-schedule/intervals') {
      return {
        userId: 5,
        year: new Date().getFullYear(),
        intervals: [{ startDate: `${new Date().getFullYear()}-01-02`, endDate: `${new Date().getFullYear()}-01-02`, status: 'WORK' }],
        stats: {},
      } as never;
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  return render(<WorkSchedulePage />);
}

afterEach(() => cleanup());

describe('WorkSchedulePage interaction', () => {
  it('opens a status menu after selecting a day and applies the chosen status', async () => {
    setup();
    const day = await screen.findByTitle(new RegExp(`${new Date().getFullYear()}-01-03`));
    fireEvent.pointerDown(day, { button: 0, clientX: 40, clientY: 60 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 60 });

    const vacation = await screen.findByRole('menuitem', { name: 'Отпуск' });
    fireEvent.click(vacation);

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByTitle(new RegExp(`${new Date().getFullYear()}-01-03`)).textContent).toContain('V');
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeTruthy();
  });

  it('does not change status on mouse wheel', async () => {
    setup();
    const day = await screen.findByTitle(new RegExp(`${new Date().getFullYear()}-01-02: Работа`));
    fireEvent.wheel(day, { deltaY: -120 });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(day.textContent).toContain('W');
    expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).toBeNull();
  });

  it('keeps Ctrl toggle selection across separate clicks', async () => {
    setup();
    const year = new Date().getFullYear();
    const first = await screen.findByTitle(new RegExp(`${year}-01-03`));
    const second = screen.getByTitle(new RegExp(`${year}-01-05`));
    fireEvent.pointerDown(first, { button: 0, clientX: 10, clientY: 10, ctrlKey: true });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    await screen.findByRole('menu');
    fireEvent.pointerDown(second, { button: 0, clientX: 20, clientY: 20, ctrlKey: true });
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 });
    expect(screen.getByText(/Выбрано: 2/)).toBeTruthy();
  });
});
