-- AlterTable
ALTER TABLE "Board" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "listedAt" TIMESTAMP(3),
ADD COLUMN "copies" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Board_listed_listedAt_idx" ON "Board"("listed", "listedAt");
