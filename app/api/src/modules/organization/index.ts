import { Router } from 'express';
import express from 'express';
import { PHOTO_MAX_BYTES, updateUserSchema } from '@app/shared';
import { accountRolesSchema, addendumSchema, assignmentSchema, baseSchema, baseUpdateSchema, bulkWellContractBasisSchema, contractPermissionSchema, contractSchema, contractUpdateSchema, customerObjectCoordinatorAssignmentSchema, customerObjectSchema, customerRepresentativeSchema, customerSchema, customerUpdateSchema, employeeManagerSchema, employeeProfileSchema, mineCoordinatorSchema, mineSchema, padSchema, padUpdateSchema, personnelCreateSchema, statusCatalogSchema, statusCatalogUpdateSchema, wellContractBasisSchema, wellSchema, workAuthorizationSchema, workExecutionSchema, workTypeSchema, workTypeUpdateSchema } from './schemas.ts';
import { adminOnly, deprecateTo, signedIn, type AppModule } from '../../core/module.ts';
import { asyncHandler as h } from '../../core/asyncHandler.ts';
import { validate } from '../../core/validate.ts';
import * as controller from './organization.controller.ts';
import * as usersController from '../users/users.controller.ts';

const deprecatePersonnel = deprecateTo('/api/me/personnel');

const organization = Router();
organization.use(...signedIn);
organization.get('/bases', h(controller.listBases));
organization.get('/employees', deprecatePersonnel, h(controller.listEmployees));
organization.get('/mines', h(controller.listMines));
organization.get('/mines/:mineId/wells', h(controller.listWells));
organization.get('/mines/:mineId/pads', h(controller.listPads));
organization.post('/mines/:mineId/pads', validate(padSchema), h(controller.createPad));
organization.patch('/mines/:mineId/pads/:padId', validate(padUpdateSchema), h(controller.updatePad));
organization.get('/wells/:wellId/customer-site-works', h(controller.listCustomerSiteWorksForWell));
organization.get('/bases/:baseId/contracts', h(controller.listContracts));
organization.get('/customers', h(controller.listCustomers));
organization.get('/customers/directory', h(controller.listCustomerDirectory));
organization.get('/customers/:customerId/details', h(controller.getCustomerDetails));
organization.get('/work-types', h(controller.listWorkTypes));
organization.get('/positions', h(controller.listPositions));
organization.get('/roles', h(controller.listRoles));
organization.get('/statuses/:category', h(controller.listStatuses));
organization.get('/users/:userId/employee', h(controller.getEmployee));
organization.get('/employees/:employeeId/history', h(controller.employeeHistory));
organization.post('/bases/:baseId/mines', validate(mineSchema), h(controller.createMine));
organization.post('/mines/:mineId/wells', validate(wellSchema), h(controller.createWell));
organization.patch('/employees/:employeeId/profile', validate(employeeProfileSchema), h(controller.updateEmployeeProfile));
organization.post('/employees/:employeeId/assignments', validate(assignmentSchema), h(controller.assignEmployee));
organization.post('/mines/:mineId/coordinator', validate(mineCoordinatorSchema), h(controller.assignMineCoordinator));
organization.post('/work/authorize', validate(workAuthorizationSchema), h(controller.authorizeWork));
organization.post('/customers', validate(customerSchema), h(controller.createCustomer));
organization.patch('/customers/:customerId', validate(customerUpdateSchema), h(controller.updateCustomer));
organization.post('/customers/:customerId/representatives', validate(customerRepresentativeSchema), h(controller.createCustomerRepresentative));
organization.patch('/customers/:customerId/representatives/:representativeId', validate(customerRepresentativeSchema), h(controller.updateCustomerRepresentative));
organization.post('/customers/:customerId/objects', validate(customerObjectSchema), h(controller.createCustomerObject));
organization.patch('/customers/:customerId/objects/:objectId', validate(customerObjectSchema), h(controller.updateCustomerObject));
organization.post('/customer-objects/:objectId/coordinator-assignments', validate(customerObjectCoordinatorAssignmentSchema), h(controller.assignCustomerObjectCoordinator));
organization.post('/bases/:baseId/contracts', validate(contractSchema), h(controller.createContract));
organization.patch('/contracts/:contractId', validate(contractUpdateSchema), h(controller.updateContract));
organization.post('/contracts/:contractId/archive', h(controller.archiveContract));
organization.get('/employees/:employeeId/account', h(usersController.getScopedAccount));
organization.patch('/employees/:employeeId/account', validate(updateUserSchema), h(usersController.updateScopedAccount));
organization.patch('/employees/:employeeId/manager', validate(employeeManagerSchema), h(controller.setEmployeeManager));
organization.post('/employees/personnel', validate(personnelCreateSchema), h(usersController.createPersonnelScoped));
organization.get('/contracts/:contractId/documents', h(controller.listContractDocuments));
organization.put('/contracts/:contractId/documents', express.raw({ type: () => true, limit: PHOTO_MAX_BYTES }), h(controller.uploadContractDocument));
organization.get('/contracts/:contractId/documents/:documentId', h(controller.downloadContractDocument));
organization.delete('/contracts/:contractId/documents/:documentId', h(controller.deleteContractDocument));
organization.post('/contracts/:contractId/addenda', validate(addendumSchema), h(controller.createAddendum));
organization.put('/contracts/:contractId/work-permissions', validate(contractPermissionSchema), h(controller.setContractPermission));
organization.put('/contracts/:contractId/addenda/:addendumId/work-permissions', validate(contractPermissionSchema), h(controller.setAddendumPermission));
organization.post('/contract-bases/bulk', validate(bulkWellContractBasisSchema), h(controller.assignWellBases));
organization.post('/wells/:wellId/contract-bases', validate(wellContractBasisSchema), h(controller.assignWellBasis));
organization.post('/work', validate(workExecutionSchema), h(controller.recordWork));

const admin = Router();
admin.use(...adminOnly);
admin.get('/roles', h(controller.listRoles));
admin.get('/employees', deprecatePersonnel, h(controller.listEmployees));
admin.post('/bases', validate(baseSchema), h(controller.createBase));
admin.patch('/bases/:baseId', validate(baseUpdateSchema), h(controller.updateBase));
admin.get('/customers', h(controller.listAdminCustomers));
admin.patch('/customers/:customerId', validate(customerUpdateSchema), h(controller.updateCustomer));
admin.get('/work-types', h(controller.listAdminWorkTypes));
admin.patch('/work-types/:workTypeId', validate(workTypeUpdateSchema), h(controller.updateWorkType));
admin.put('/users/:userId/roles', validate(accountRolesSchema), h(controller.setAccountRoles));
admin.post('/statuses', validate(statusCatalogSchema), h(controller.createStatus));
admin.patch('/statuses/:category/:id', validate(statusCatalogUpdateSchema), h(controller.updateStatus));
admin.post('/work-types', validate(workTypeSchema), h(controller.createWorkType));

export const organizationModule: AppModule = {
  name: 'organization',
  routes: [
    { path: '/api/org', router: organization },
    { path: '/api/admin/org', router: admin },
  ],
};
