import type { ReactNode } from 'react';
import type { SystemRoleCode } from '@app/shared';
import { Protected, homePath, useAuth, useCurrentUser } from './core/auth.tsx';
import { Layout } from './Layout.tsx';
import { Redirect, matchPath, useRouter } from './core/router.tsx';
import { LoginPage } from './modules/auth/LoginPage.tsx';
import { ChangePasswordPage } from './modules/auth/ChangePasswordPage.tsx';
import { NotificationsPage } from './modules/notifications/NotificationsPage.tsx';
import { AdminDashboardPage } from './modules/dashboard/AdminDashboardPage.tsx';
import { UsersPage } from './modules/users/UsersPage.tsx';
import { UserDetailPage } from './modules/users/UserDetailPage.tsx';
import { AdminCredentialsPage } from './modules/credentials/AdminCredentialsPage.tsx';
import { CatalogPage } from './modules/catalog/CatalogPage.tsx';
import { MessagesPage } from './modules/messages/MessagesPage.tsx';
import { AuditLogPage } from './modules/audit/AuditLogPage.tsx';
import { OverviewPage } from './modules/overview/OverviewPage.tsx';
import { PositionsPage } from './modules/positions/PositionsPage.tsx';
import { UserDashboardPage } from './modules/dashboard/UserDashboardPage.tsx';
import { UserCredentialsPage } from './modules/credentials/UserCredentialsPage.tsx';
import { ProfilePage } from './modules/profile/ProfilePage.tsx';
import { RadarCardsPage } from './modules/radar/RadarCardsPage.tsx';
import { IfoPage } from './modules/ifo/IfoPage.tsx';
import { WorkSchedulePage } from './modules/schedule/WorkSchedulePage.tsx';
import { AnnualSchedulePage } from './modules/schedule/AnnualSchedulePage.tsx';
import { ShiftPartnersPage } from './modules/schedule/ShiftPartnersPage.tsx';
import { ScheduleGeneratePage } from './modules/schedule/ScheduleGeneratePage.tsx';
import { OrganizationPage } from './modules/organization/OrganizationPage.tsx';
import { WorkExecutionPage } from './modules/organization/WorkExecutionPage.tsx';
import { CustomerDirectoryPage } from './modules/organization/CustomerDirectoryPage.tsx';
import { BaseCatalogPage } from './modules/organization/BaseCatalogPage.tsx';
import { ReferenceDataPage } from './modules/organization/ReferenceDataPage.tsx';
import { SettingsPage } from './modules/settings/SettingsPage.tsx';
import { PersonnelPage } from './modules/organization/PersonnelPage.tsx';
import { CustomerSiteWorksPage } from './modules/organization/CustomerSiteWorksPage.tsx';
import { PlannedWorkSchedulePage } from './modules/organization/PlannedWorkSchedulePage.tsx';

interface Route {
  path: string;
  systemRoles?: SystemRoleCode[];
  render: (params: Record<string, string>) => ReactNode;
}

const LEAD: SystemRoleCode[] = ['ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC'];
const SCHEDULE_EDITOR: SystemRoleCode[] = ['ADMIN', 'MANAGER', 'COORDINATOR'];
const WORKSPACE: SystemRoleCode[] = [
  'ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC', 'MECHANIC', 'SHOP_FOREMAN', 'EMPLOYEE', 'SHOP_EMPLOYEE',
];

function MeDashboard() {
  const user = useCurrentUser();
  return user.systemRoles.some((role) => LEAD.includes(role)) ? <AdminDashboardPage /> : <UserDashboardPage />;
}

function MeWorkScheduleTable() {
  const user = useCurrentUser();
  return user.systemRoles.some((role) => SCHEDULE_EDITOR.includes(role)) ? <AnnualSchedulePage /> : <WorkSchedulePage />;
}

function MeOrganization() {
  const user = useCurrentUser();
  const leadStructure = user.systemRoles.some((role) =>
    ['ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC', 'MECHANIC', 'SHOP_FOREMAN'].includes(role),
  );
  return leadStructure
    ? <OrganizationPage key="structure" view="structure" />
    : <OrganizationPage key="overview" />;
}

/** Рабочая область текущего пользователя. `/admin/*` остаётся только для администрирования системы. */
const ROUTES: Route[] = [
  { path: '/me/dashboard', systemRoles: WORKSPACE, render: () => <MeDashboard /> },
  { path: '/me/overview', systemRoles: LEAD, render: () => <OverviewPage /> },
  { path: '/me/personnel', systemRoles: ['ADMIN', 'MANAGER', 'COORDINATOR'], render: () => <PersonnelPage /> },
  { path: '/me/assignments', systemRoles: ['ADMIN', 'MANAGER'], render: () => <OrganizationPage key="assignments" view="assignments" /> },
  { path: '/me/transfers', systemRoles: ['ADMIN', 'MANAGER'], render: () => <OrganizationPage key="transfers" view="transfers" /> },
  { path: '/me/planned-work', systemRoles: ['ADMIN', 'MANAGER', 'COORDINATOR', 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <PlannedWorkSchedulePage /> },
  { path: '/me/customer-site-works', systemRoles: ['ADMIN', 'COORDINATOR', 'MANAGER'], render: () => <CustomerSiteWorksPage /> },
  { path: '/me/contracts', systemRoles: ['ADMIN', 'MANAGER'], render: () => <CustomerDirectoryPage /> },
  { path: '/me/work-schedule', systemRoles: [...SCHEDULE_EDITOR, 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <MeWorkScheduleTable /> },
  { path: '/me/work-schedule/calendar', systemRoles: [...SCHEDULE_EDITOR, 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <WorkSchedulePage /> },
  { path: '/me/radar-cards', systemRoles: ['ADMIN', 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <RadarCardsPage /> },
  { path: '/me/ifo', systemRoles: ['ADMIN', 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <IfoPage /> },
  { path: '/me/work-execution', systemRoles: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <WorkExecutionPage /> },
  { path: '/me/organization', systemRoles: WORKSPACE, render: () => <MeOrganization /> },
  { path: '/me/team-credentials', systemRoles: ['ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC', 'MECHANIC', 'SHOP_FOREMAN'], render: () => <AdminCredentialsPage /> },
  { path: '/me/credentials', systemRoles: ['EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <UserCredentialsPage /> },
  { path: '/me/notifications', render: () => <NotificationsPage /> },
  { path: '/me/messages', render: () => <MessagesPage /> },
  { path: '/me/work-schedule/generate', systemRoles: ['ADMIN', 'MANAGER', 'COORDINATOR'], render: () => <ScheduleGeneratePage /> },
  { path: '/me/profile', systemRoles: ['MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC', 'MECHANIC', 'SHOP_FOREMAN', 'EMPLOYEE', 'SHOP_EMPLOYEE'], render: () => <ProfilePage /> },

  { path: '/admin/users', systemRoles: ['ADMIN'], render: () => <UsersPage /> },
  { path: '/admin/users/:id', systemRoles: ['ADMIN'], render: (p) => <UserDetailPage key={p.id} id={Number(p.id)} /> },
  { path: '/admin/dictionaries/bases', systemRoles: ['ADMIN'], render: () => <BaseCatalogPage /> },
  { path: '/admin/dictionaries/organization', systemRoles: ['ADMIN'], render: () => <ReferenceDataPage /> },
  { path: '/admin/catalog', systemRoles: ['ADMIN'], render: () => <CatalogPage /> },
  { path: '/admin/positions', systemRoles: ['ADMIN'], render: () => <PositionsPage /> },
  { path: '/admin/audit-log', systemRoles: ['ADMIN'], render: () => <AuditLogPage /> },
  { path: '/admin/work-schedule/shift-partners', systemRoles: ['ADMIN'], render: () => <ShiftPartnersPage /> },

  { path: '/settings', render: () => <SettingsPage /> },
];

/** Старые адресные префиксы → `/me` (или оставшийся `/admin` для админ-операций). */
const LEGACY_REDIRECTS: Record<string, string> = {
  '/admin/dashboard': '/me/dashboard',
  '/admin/overview': '/me/overview',
  '/admin/org/personnel': '/me/personnel',
  '/admin/org/assignments': '/me/assignments',
  '/admin/org/transfers': '/me/transfers',
  '/admin/org/contracts': '/me/contracts',
  '/admin/planned-work': '/me/planned-work',
  '/admin/customer-site-works': '/me/customer-site-works',
  '/admin/work-schedule': '/me/work-schedule',
  '/admin/work-schedule/calendar': '/me/work-schedule/calendar',
  '/admin/team-work-schedule': '/me/work-schedule',
  '/admin/team-work-schedule/calendar': '/me/work-schedule/calendar',
  '/admin/radar-cards': '/me/radar-cards',
  '/admin/ifo': '/me/ifo',
  '/admin/work-execution': '/me/work-execution',
  '/admin/organization': '/me/organization',
  '/admin/credentials': '/me/team-credentials',
  '/admin/notifications': '/me/notifications',
  '/admin/messages': '/me/messages',
  '/user/dashboard': '/me/dashboard',
  '/user/work-schedule': '/me/work-schedule',
  '/user/work-schedule/calendar': '/me/work-schedule/calendar',
  '/user/radar-cards': '/me/radar-cards',
  '/user/ifo': '/me/ifo',
  '/user/organization': '/me/organization',
  '/user/work-execution': '/me/work-execution',
  '/user/planned-work': '/me/planned-work',
  '/user/credentials': '/me/credentials',
  '/user/notifications': '/me/notifications',
  '/user/profile': '/me/profile',
};

function Home() {
  const { user } = useAuth();
  return <Redirect to={user ? homePath(user) : '/login'} />;
}

function LegacyRedirect({ to }: { to: string }) {
  return <Redirect to={to + window.location.search} />;
}

export function App() {
  const { path } = useRouter();

  if (path === '/login') return <LoginPage />;
  if (path === '/change-password') {
    return (
      <Protected>
        <ChangePasswordPage />
      </Protected>
    );
  }

  const legacy = LEGACY_REDIRECTS[path];
  if (legacy) {
    return (
      <Protected>
        <LegacyRedirect to={legacy} />
      </Protected>
    );
  }

  for (const route of ROUTES) {
    const params = matchPath(route.path, path);
    if (params) {
      return (
        <Protected systemRoles={route.systemRoles}>
          <Layout>{route.render(params)}</Layout>
        </Protected>
      );
    }
  }

  return (
    <Protected>
      <Home />
    </Protected>
  );
}
