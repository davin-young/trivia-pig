-- AlterTable
ALTER TABLE "User" ADD COLUMN     "oidcSub" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "User_oidcSub_key" ON "User"("oidcSub");
