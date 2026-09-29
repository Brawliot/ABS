-- Crea BD secundaria de restore en el mismo servidor (por si no se usa el segundo contenedor).
SELECT 'CREATE DATABASE abs_restore OWNER abs'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abs_restore')\gexec
