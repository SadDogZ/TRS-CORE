-- DropForeignKey
ALTER TABLE `CustomerObjectCoordinatorAssignment` DROP FOREIGN KEY `cust_obj_coord_cur_obj_fk`;

-- AlterTable
ALTER TABLE `CustomerObjectCoordinatorAssignment` MODIFY `startsAt` DATE NOT NULL,
    MODIFY `endsAt` DATE NULL;
