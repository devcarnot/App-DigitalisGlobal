-- Fix: erp_profiles guards were overwriting `role` on UPDATE (locking to client).
-- Invite / app flows set role to team_member or team_lead — DB must honour that.
--
-- Old objects (exact names may vary if you renamed them manually):
--   TRIGGER erp_profiles_guard_insert_role_trg        BEFORE INSERT
--   TRIGGER erp_profiles_guard_protected_columns_trg  BEFORE UPDATE
--
-- Applied strategy:
--   INSERT: Only default role to client when callers omit NEW.role entirely.
--   UPDATE: Stop touching `role`; only ensure id isn't changed (minimal safety).

-- 1) Detach triggers
DROP TRIGGER IF EXISTS erp_profiles_guard_insert_role_trg ON public.erp_profiles;

DROP TRIGGER IF EXISTS erp_profiles_guard_protected_columns_trg ON public.erp_profiles;

-- 2) Drop old implementations (PostgreSQL resolves trigger func as (no args)).
-- Two common naming patterns appear in dashboards; CASCADE is safe once triggers dropped.
DROP FUNCTION IF EXISTS public.erp_profiles_guard_insert_role() CASCADE;

DROP FUNCTION IF EXISTS public.erp_profiles_guard_protected_columns() CASCADE;

-- If your schema used different pronames, uncomment and fix after inspecting:
--   SELECT t.tgname, p.oid::regprocedure
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname = 'erp_profiles' AND NOT t.tgisinternal;

-- 3) INSERT guard: fill default only when role is absent (backward compatible)
CREATE OR REPLACE FUNCTION public.erp_profiles_guard_insert_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NULL THEN
    NEW.role := 'client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER erp_profiles_guard_insert_role_trg
  BEFORE INSERT ON public.erp_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.erp_profiles_guard_insert_role();

-- 4) UPDATE guard: do NOT override role (or phone / invites / admin PATCH will lose again).
-- Extend this function if you need to freeze OTHER columns besides id.
CREATE OR REPLACE FUNCTION public.erp_profiles_guard_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER erp_profiles_guard_protected_columns_trg
  BEFORE UPDATE ON public.erp_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.erp_profiles_guard_protected_columns();
