ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Existing accounts receive distinct usernames and can still log in by email.
WITH legacy_names AS (
    SELECT "id", 'user_' || ROW_NUMBER() OVER (ORDER BY "id") AS "username"
    FROM "User"
)
UPDATE "User"
SET "username" = legacy_names."username"
FROM legacy_names
WHERE "User"."id" = legacy_names."id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
