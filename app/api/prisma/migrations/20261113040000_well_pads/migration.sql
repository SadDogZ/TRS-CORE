-- Кусты (WellPad) как дочерние записи месторождения.
-- Существующие номера кустов на скважинах переносятся в справочник и связываются, сами скважины и clusterNumber не удаляются.

CREATE TABLE `WellPad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mineId` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WellPad_mineId_name_key`(`mineId`, `name`),
    INDEX `WellPad_mineId_isActive_idx`(`mineId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WellPad`
    ADD CONSTRAINT `WellPad_mineId_fkey` FOREIGN KEY (`mineId`) REFERENCES `Mine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `WellPad_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `WellPad` (`mineId`, `name`, `isActive`, `createdAt`, `updatedAt`)
SELECT `mineId`, TRIM(`clusterNumber`), true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Well`
WHERE `clusterNumber` IS NOT NULL AND TRIM(`clusterNumber`) <> ''
GROUP BY `mineId`, TRIM(`clusterNumber`);

ALTER TABLE `Well` ADD COLUMN `padId` INTEGER NULL;

UPDATE `Well` AS `w`
INNER JOIN `WellPad` AS `p` ON `p`.`mineId` = `w`.`mineId` AND `p`.`name` = TRIM(`w`.`clusterNumber`)
SET `w`.`padId` = `p`.`id`
WHERE `w`.`clusterNumber` IS NOT NULL AND TRIM(`w`.`clusterNumber`) <> '';

CREATE INDEX `Well_padId_idx` ON `Well`(`padId`);

ALTER TABLE `Well`
    ADD CONSTRAINT `Well_padId_fkey` FOREIGN KEY (`padId`) REFERENCES `WellPad`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
