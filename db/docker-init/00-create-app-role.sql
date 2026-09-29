-- Rol de aplicación (GRANT en dumps / migraciones)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abs_app') THEN
    CREATE ROLE abs_app LOGIN PASSWORD 'change-me-in-deploy';
  END IF;
END$$;
