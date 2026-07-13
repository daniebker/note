-- Backfill: existing rows have no username yet (the column was added nullable
-- in the prior migration). Fall back to the id, which is already unique, so
-- the NOT NULL + UNIQUE constraints below don't fail against existing data.
UPDATE "User" SET "username" = "id" WHERE "username" IS NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
-- A prior failed run of this migration may have left this scratch table
-- behind (SQLite doesn't transact across the PRAGMA toggles above).
DROP TABLE IF EXISTS "new_User";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "username") SELECT "createdAt", "email", "id", "name", "passwordHash", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
