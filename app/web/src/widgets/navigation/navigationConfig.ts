import type { Language, UserDto } from '@app/shared';
import type { IconName } from '@app/shared/ui';
import { translateSourceText } from '../../core/locale.ts';

export interface NavItem { to: string; label: string; icon: IconName }
export interface NavSubgroup { label: string; icon: IconName; items: NavItem[] }
export interface NavGroup { label: string; icon: IconName; to?: string; items?: NavItem[]; subgroups?: NavSubgroup[] }

const USER_ITEMS: NavItem[] = [
  { to: '/user/organization', label: 'Моя база и команда', icon: 'people' },
  { to: '/user/work-execution', label: 'Договоры и работы', icon: 'doneAll' },
  { to: '/user/planned-work', label: 'План работ', icon: 'work' },
  { to: '/user/credentials', label: 'Удостоверения', icon: 'badge' },
];
const ADMIN_PEOPLE_ITEMS: NavItem[] = [
  { to: '/admin/overview', label: 'Список удостоверений', icon: 'overview' },
  { to: '/admin/credentials', label: 'Записи удостоверений', icon: 'badge' },
];
const WPTS_ITEMS: NavItem[] = [
  { to: '/admin/radar-cards', label: 'Радар карты', icon: 'warning' },
  { to: '/admin/ifo', label: 'IFO', icon: 'overview' },
];
const USER_WPTS_ITEMS: NavItem[] = [
  { to: '/user/radar-cards', label: 'Радар карты', icon: 'warning' },
  { to: '/user/ifo', label: 'IFO', icon: 'overview' },
];
const ROOT_ADMIN_ITEMS: NavItem[] = [
  { to: '/admin/notifications', label: 'Уведомления', icon: 'bell' },
  { to: '/admin/messages', label: 'Сообщения', icon: 'send' },
  { to: '/admin/audit-log', label: 'Аудит и логи', icon: 'history' },
];
const ROOT_USER_ITEMS: NavItem[] = [{ to: '/user/notifications', label: 'Уведомления', icon: 'bell' }];
const SCHEDULE_ADMIN_ITEMS: NavItem[] = [
  { to: '/admin/work-schedule', label: 'Таблица', icon: 'table' },
  { to: '/admin/work-schedule/calendar', label: 'Редактирование', icon: 'overview' },
  { to: '/admin/work-schedule/shift-partners', label: 'Генерация сменщиков', icon: 'people' },
];
const SCHEDULE_USER_ITEMS: NavItem[] = [
  { to: '/user/work-schedule', label: 'Таблица', icon: 'table' },
  { to: '/user/work-schedule/calendar', label: 'Мой график', icon: 'overview' },
];
const SCHEDULE_LEAD_ITEMS: NavItem[] = [
  { to: '/admin/team-work-schedule', label: 'График команды', icon: 'table' },
  { to: '/admin/team-work-schedule/calendar', label: 'Редактировать график', icon: 'overview' },
];
const ADMIN_NAV_GROUPS: NavGroup[] = [
  { label: 'Панель управления', icon: 'dashboard', to: '/admin/dashboard' },
  { label: 'Сотрудники', icon: 'people', subgroups: [
    { label: 'Удостоверения', icon: 'badge', items: ADMIN_PEOPLE_ITEMS },
    { label: 'WPTS', icon: 'grid', items: WPTS_ITEMS },
    { label: 'Учёт графиков', icon: 'table', items: SCHEDULE_ADMIN_ITEMS },
  ] },
  { label: 'Организация БПО', icon: 'people', subgroups: [
    { label: 'Работа с персоналом', icon: 'people', items: [
      { to: '/admin/org/personnel', label: 'Персонал', icon: 'people' },
      { to: '/admin/org/assignments', label: 'Назначения и переводы', icon: 'doneAll' },
    ] },
    { label: 'Выполнение работ', icon: 'work', items: [
      { to: '/admin/org/contracts', label: 'Договоры', icon: 'book' },
      { to: '/admin/organization', label: 'Месторождения и скважины', icon: 'grid' },
      { to: '/admin/planned-work', label: 'План работ', icon: 'work' },
    ] },
  ] },
  { label: 'Справочники', icon: 'book', items: [
    { to: '/admin/dictionaries/bases', label: 'Базы', icon: 'grid' },
    { to: '/admin/dictionaries/organization', label: 'Статусы и виды работ', icon: 'book' },
    { to: '/admin/positions', label: 'Должности', icon: 'work' },
    { to: '/admin/catalog', label: 'Удостоверения', icon: 'badge' },
  ] },
  { label: 'Общие разделы', icon: 'grid', items: ROOT_ADMIN_ITEMS },
];
const USER_NAV_GROUPS: NavGroup[] = [
  { label: 'Панель управления', icon: 'dashboard', to: '/user/dashboard' },
  { label: 'Сотрудники', icon: 'people', subgroups: [
    { label: 'Работа и удостоверения', icon: 'badge', items: USER_ITEMS },
    { label: 'WPTS', icon: 'grid', items: USER_WPTS_ITEMS },
    { label: 'Учёт графиков', icon: 'table', items: SCHEDULE_USER_ITEMS },
  ] },
  { label: 'Общие разделы', icon: 'grid', items: ROOT_USER_ITEMS },
];
const LEAD_PEOPLE_ITEMS: NavItem[] = [
  { to: '/admin/overview', label: 'Удостоверения команды', icon: 'overview' },
  { to: '/admin/credentials', label: 'Записи удостоверений', icon: 'badge' },
];
const CREDENTIAL_LEAD_NAV_GROUPS: NavGroup[] = [
  { label: 'Моя организация', icon: 'people', to: '/admin/organization' },
  { label: 'Записи удостоверений', icon: 'badge', to: '/admin/credentials' },
  { label: 'Общие разделы', icon: 'grid', items: [{ to: '/settings', label: 'Настройки', icon: 'settings' }] },
];

export function resolveNavGroups(user: UserDto, language: Language): NavGroup[] {
  const roles = user.systemRoles;
  const has = (role: string) => roles.includes(role as (typeof roles)[number]);
  const isManager = has('MANAGER');
  const isCoordinator = has('COORDINATOR');
  const isSeniorMechanic = has('SENIOR_MECHANIC');
  const isLead = isManager || isCoordinator || isSeniorMechanic;
  const isCredentialLead = has('MECHANIC') || has('SHOP_FOREMAN');

  let groups: NavGroup[];
  if (has('ADMIN')) {
    groups = ADMIN_NAV_GROUPS;
  } else if (isLead) {
    const teamItems: NavItem[] = [...LEAD_PEOPLE_ITEMS];
    if (isManager) {
      teamItems.push({ to: '/admin/org/personnel', label: 'Персонал', icon: 'people' });
    }
    if (isManager || isCoordinator) {
      teamItems.push(...SCHEDULE_LEAD_ITEMS);
    }
    if (isCoordinator && !isManager) {
      teamItems.push({ to: '/admin/org/personnel', label: 'Персонал', icon: 'people' });
    }
    if (isCoordinator) {
      teamItems.push({ to: '/admin/customer-site-works', label: 'Работы заказчика', icon: 'work' });
    }

    const orgItems: NavItem[] = [{ to: '/admin/organization', label: 'Месторождения и скважины', icon: 'grid' }];
    if (isManager || isCoordinator) {
      orgItems.push({ to: '/admin/planned-work', label: 'План работ', icon: 'work' });
    }
    if (isManager) {
      orgItems.push(
        { to: '/admin/org/assignments', label: 'Назначения и переводы', icon: 'doneAll' },
        { to: '/admin/org/contracts', label: 'Договоры', icon: 'book' },
        { to: '/admin/work-execution', label: 'Выполнение работ', icon: 'doneAll' },
      );
    }

    groups = [
      { label: 'Панель управления', icon: 'dashboard', to: '/admin/dashboard' },
      { label: 'Моя организация', icon: 'people', items: orgItems },
      { label: 'Моя команда', icon: 'people', items: teamItems },
      { label: 'Общие разделы', icon: 'grid', items: [{ to: '/settings', label: 'Настройки', icon: 'settings' }] },
    ];
  } else if (isCredentialLead) {
    groups = CREDENTIAL_LEAD_NAV_GROUPS;
  } else {
    groups = USER_NAV_GROUPS;
  }

  const localizeItem = (item: NavItem): NavItem => ({ ...item, label: translateSourceText(item.label, language) });
  return groups.map((group) => ({
    ...group,
    label: translateSourceText(group.label, language),
    items: group.items?.map(localizeItem),
    subgroups: group.subgroups?.map((subgroup) => ({ ...subgroup, label: translateSourceText(subgroup.label, language), items: subgroup.items.map(localizeItem) })),
  }));
}

export function isNavItemActive(path: string, to: string) { return path === to; }
export function groupHasActivePath(group: NavGroup, path: string) {
  if (group.to) return isNavItemActive(path, group.to);
  return [...(group.items ?? []), ...(group.subgroups ?? []).flatMap((subgroup) => subgroup.items)].some((item) => isNavItemActive(path, item.to));
}
export function subgroupHasActivePath(group: NavSubgroup, path: string) { return group.items.some((item) => isNavItemActive(path, item.to)); }
