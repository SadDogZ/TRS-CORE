/*
  Warnings:

  - You are about to drop the `WorkScheduleEntry` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `WorkScheduleEntry` DROP FOREIGN KEY `WorkScheduleEntry_userId_fkey`;

-- DropTable
DROP TABLE `WorkScheduleEntry`;
