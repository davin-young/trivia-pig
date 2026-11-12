-- "First player in can start the game" is now off unless the host turns it on. Defaults that
-- hosts saved earlier carried the old value (on) whether or not they chose it, so they are
-- reset once; a host who wants it can switch it on and save their defaults again.
UPDATE "User" SET "gameDefaults" = jsonb_set("gameDefaults", '{vipStart}', 'false'::jsonb) WHERE "gameDefaults" IS NOT NULL AND jsonb_typeof("gameDefaults") = 'object';
