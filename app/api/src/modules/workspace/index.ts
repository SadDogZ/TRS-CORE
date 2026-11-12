import { Router } from 'express';
import { overviewQuerySchema } from '@app/shared';
import { currentUser, requireSystemRole } from '../../core/auth.ts';
import { asyncHandler as h } from '../../core/asyncHandler.ts';
import { signedIn, type AppModule } from '../../core/module.ts';
import { validQuery, validate } from '../../core/validate.ts';
import { getDashboard } from '../dashboard/dashboard.service.ts';
import { getOverview } from '../overview/overview.service.ts';
import { listEmployees, listWorkspaceContracts } from '../organization/organization.service.ts';

const personnel = Router();
personnel.use(...signedIn);
personnel.get('/', h(async (req, res) => res.json(await listEmployees(currentUser(req)))));

const contracts = Router();
contracts.use(...signedIn);
contracts.get('/', h(async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true' || req.query.includeArchived === '1';
  res.json(await listWorkspaceContracts(currentUser(req), includeArchived));
}));

const dashboard = Router();
dashboard.use(...signedIn, requireSystemRole('ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC'));
dashboard.get('/', h(async (req, res) => res.json(await getDashboard(currentUser(req)))));

const overview = Router();
overview.use(...signedIn, requireSystemRole('ADMIN', 'MANAGER', 'COORDINATOR', 'SENIOR_MECHANIC'));
overview.get('/', validate(overviewQuerySchema, 'query'), h(async (req, res) => res.json(await getOverview(currentUser(req), validQuery(req)))));

/** Операции текущего пользователя и его зоны доступа. Старые префиксы описаны в docs/api-workspace.md. */
export const workspaceModule: AppModule = {
  name: 'workspace',
  routes: [
    { path: '/api/me/personnel', router: personnel },
    { path: '/api/me/contracts', router: contracts },
    { path: '/api/me/dashboard', router: dashboard },
    { path: '/api/me/overview', router: overview },
  ],
};
