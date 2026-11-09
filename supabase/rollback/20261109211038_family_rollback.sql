-- =============================================
-- 계정 구조 개편(supabase/migrations/20261109211038_family.sql) 되돌리기 — 비상용
-- 개편 직후 문제가 생겼을 때만 쓰세요.
--
-- 순서
--  1. 이 파일 실행
--  2. supabase/migrations/20261109074851_security.sql 다시 실행 (0단계 보안 정책 복원)
--  3. Vercel에서 개편 이전 배포로 되돌리기 (Deployments → 이전 배포 → Promote to Production)
--
-- 개편 후에 새로 만든 자녀 프로필·학습 기록은 옛 구조(학생 로그인 계정)에 대응되는
-- 계정이 없어 옛 화면에서는 보이지 않습니다. 데이터는 지우지 않고 남겨둡니다.
-- =============================================

BEGIN;

-- 1. 학습 데이터 FK: children → profiles (원래 이름으로)
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('word_sets', 'child_id'),
      ('learning_records', 'student_id'),
      ('review_schedules', 'student_id'),
      ('rewards', 'student_id')
    ) AS v(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                   t.tbl, format('%s_%s_child_fkey', t.tbl, t.col));
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = format('%s_%s_fkey', t.tbl, t.col)
    ) THEN
      -- 개편 후 만든 자녀는 profiles에 없으므로 NOT VALID (기존 행은 검사하지 않음)
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
        'REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID',
        t.tbl, format('%s_%s_fkey', t.tbl, t.col), t.col
      );
    END IF;
  END LOOP;
END $$;

-- 2. 회원가입 트리거 원복 (가족 생성 없음)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    COALESCE(new.email, ''),
    COALESCE(new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 3. 새 테이블은 클라이언트 접근만 막고 데이터는 보존
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('families', 'family_members', 'family_secrets', 'children')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

COMMIT;

-- 이어서 supabase/migrations/20261109074851_security.sql을 실행하세요.
