-- DropIndex (remove unused free-text code from Mine; no other table references it)
ALTER TABLE `Mine` DROP INDEX `Mine_baseId_code_key`;

-- AlterTable
ALTER TABLE `Mine` DROP COLUMN `code`;

-- AlterTable: explicit "ответственный менеджер" field for EmployeeAssignment (separate from supervisorEmployeeId)
ALTER TABLE `EmployeeAssignment` ADD COLUMN `managerId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `EmployeeAssignment_managerId_startsAt_endsAt_idx` ON `EmployeeAssignment`(`managerId`, `startsAt`, `endsAt`);

-- AddForeignKey
ALTER TABLE `EmployeeAssignment` ADD CONSTRAINT `EmployeeAssignment_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed ARCHIVED contract status (contract archiving feature)
INSERT INTO `ContractStatus` (`code`, `name`, `allowsWork`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'ARCHIVED', 'В архиве', false, true, 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `ContractStatus` WHERE `code` = 'ARCHIVED');
