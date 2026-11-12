-- A player's saved name, drawings and results. Found again by a cookie on the device, or by
-- the account it was saved to. Nobody needs one to play.
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "signature" JSONB,
    "avatar" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerProfile_tokenHash_key" ON "PlayerProfile"("tokenHash");
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One finished game for one profile. gameId is not a foreign key: the result outlives the game.
CREATE TABLE "PlayerResult" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "boardTitle" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "place" INTEGER NOT NULL,
    "contestants" INTEGER NOT NULL,
    "right" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "team" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerResult_profileId_gameId_key" ON "PlayerResult"("profileId", "gameId");
CREATE INDEX "PlayerResult_gameId_idx" ON "PlayerResult"("gameId");
ALTER TABLE "PlayerResult" ADD CONSTRAINT "PlayerResult_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePlayer" ADD COLUMN "profileId" TEXT;
CREATE INDEX "GamePlayer_profileId_idx" ON "GamePlayer"("profileId");
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
