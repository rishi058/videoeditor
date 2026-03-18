-- 003_fix_auth_camelcase.sql
-- Postgres folds unquoted identifiers to lowercase.
-- Better Auth expects them in camelCase, so we need to rename them and wrap them in double quotes.

DO $$
BEGIN
  -- user table
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='user' and column_name='emailverified') THEN
    ALTER TABLE "user" RENAME COLUMN emailverified TO "emailVerified";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='user' and column_name='createdat') THEN
    ALTER TABLE "user" RENAME COLUMN createdat TO "createdAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='user' and column_name='updatedat') THEN
    ALTER TABLE "user" RENAME COLUMN updatedat TO "updatedAt";
  END IF;

  -- session table
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='expiresat') THEN
    ALTER TABLE session RENAME COLUMN expiresat TO "expiresAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='createdat') THEN
    ALTER TABLE session RENAME COLUMN createdat TO "createdAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='updatedat') THEN
    ALTER TABLE session RENAME COLUMN updatedat TO "updatedAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='ipaddress') THEN
    ALTER TABLE session RENAME COLUMN ipaddress TO "ipAddress";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='useragent') THEN
    ALTER TABLE session RENAME COLUMN useragent TO "userAgent";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='session' and column_name='userid') THEN
    ALTER TABLE session RENAME COLUMN userid TO "userId";
  END IF;

  -- account table
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='accountid') THEN
    ALTER TABLE account RENAME COLUMN accountid TO "accountId";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='providerid') THEN
    ALTER TABLE account RENAME COLUMN providerid TO "providerId";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='userid') THEN
    ALTER TABLE account RENAME COLUMN userid TO "userId";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='accesstoken') THEN
    ALTER TABLE account RENAME COLUMN accesstoken TO "accessToken";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='refreshtoken') THEN
    ALTER TABLE account RENAME COLUMN refreshtoken TO "refreshToken";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='idtoken') THEN
    ALTER TABLE account RENAME COLUMN idtoken TO "idToken";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='accesstokenexpiresat') THEN
    ALTER TABLE account RENAME COLUMN accesstokenexpiresat TO "accessTokenExpiresAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='refreshtokenexpiresat') THEN
    ALTER TABLE account RENAME COLUMN refreshtokenexpiresat TO "refreshTokenExpiresAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='createdat') THEN
    ALTER TABLE account RENAME COLUMN createdat TO "createdAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='account' and column_name='updatedat') THEN
    ALTER TABLE account RENAME COLUMN updatedat TO "updatedAt";
  END IF;

  -- verification table
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='verification' and column_name='expiresat') THEN
    ALTER TABLE verification RENAME COLUMN expiresat TO "expiresAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='verification' and column_name='createdat') THEN
    ALTER TABLE verification RENAME COLUMN createdat TO "createdAt";
  END IF;
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='verification' and column_name='updatedat') THEN
    ALTER TABLE verification RENAME COLUMN updatedat TO "updatedAt";
  END IF;
END $$;
