ALTER TABLE `Customer`
    ADD COLUMN `address` VARCHAR(300) NULL,
    ADD COLUMN `comments` TEXT NULL,
    ADD COLUMN `baseId` INTEGER NULL,
    ADD INDEX `Customer_baseId_isActive_idx`(`baseId`, `isActive`),
    ADD CONSTRAINT `Customer_baseId_fkey`
        FOREIGN KEY (`baseId`) REFERENCES `Base`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `CustomerRepresentative` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `fullName` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(150) NULL,
    `relationship` VARCHAR(200) NULL,
    `comments` TEXT NULL,
    `dedupKey` VARCHAR(400) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CustomerRepresentative_customerId_dedupKey_key`(`customerId`, `dedupKey`),
    INDEX `CustomerRepresentative_customerId_fullName_idx`(`customerId`, `fullName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerRepresentative`
    ADD CONSTRAINT `CustomerRepresentative_customerId_fkey`
        FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `CustomerObject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `baseId` INTEGER NOT NULL,
    `contractId` INTEGER NULL,
    `name` VARCHAR(200) NOT NULL,
    `relationship` VARCHAR(200) NOT NULL,
    `comments` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CustomerObject_customerId_baseId_name_key`(`customerId`, `baseId`, `name`),
    INDEX `CustomerObject_baseId_status_isActive_idx`(`baseId`, `status`, `isActive`),
    INDEX `CustomerObject_contractId_idx`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerObject`
    ADD CONSTRAINT `CustomerObject_customerId_fkey`
        FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CustomerObject`
    ADD CONSTRAINT `CustomerObject_baseId_fkey`
        FOREIGN KEY (`baseId`) REFERENCES `Base`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CustomerObject`
    ADD CONSTRAINT `CustomerObject_contractId_fkey`
        FOREIGN KEY (`contractId`) REFERENCES `Contract`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `CustomerObjectCoordinatorAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerObjectId` INTEGER NOT NULL,
    `coordinatorId` INTEGER NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `comment` TEXT NULL,
    `operationId` VARCHAR(36) NOT NULL,
    `currentCustomerObjectId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `cust_obj_coord_cur_obj_uq`(`currentCustomerObjectId`),
    INDEX `cust_obj_coord_obj_dates_idx`(`customerObjectId`, `startsAt`, `endsAt`),
    INDEX `cust_obj_coord_emp_dates_idx`(`coordinatorId`, `startsAt`, `endsAt`),
    INDEX `cust_obj_coord_op_idx`(`operationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerObjectCoordinatorAssignment`
    ADD CONSTRAINT `cust_obj_coord_obj_fk`
        FOREIGN KEY (`customerObjectId`) REFERENCES `CustomerObject`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CustomerObjectCoordinatorAssignment`
    ADD CONSTRAINT `cust_obj_coord_emp_fk`
        FOREIGN KEY (`coordinatorId`) REFERENCES `Employee`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CustomerObjectCoordinatorAssignment`
    ADD CONSTRAINT `cust_obj_coord_cur_obj_fk`
        FOREIGN KEY (`currentCustomerObjectId`) REFERENCES `CustomerObject`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CustomerObjectCoordinatorAssignment`
    ADD CONSTRAINT `cust_obj_coord_user_fk`
        FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
