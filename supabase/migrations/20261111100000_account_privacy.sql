-- =============================================
-- 공개 서비스 준비: 약관 동의 기록, 자녀 정보 법정대리인 동의, 회원 탈퇴
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고, 여러 번 실행해도 결과가 같습니다.
-- 먼저 20261110200100_lesson_v2.sql까지 적용되어 있어야 합니다.
--
--  1. profiles: 어떤 버전의 약관·개인정보 처리방침에 언제 동의했는지
--     - 회원가입 화면에서 동의하면 가입 메타데이터(terms_version)로 넘어와 가입 트리거가 기록
--     - 기존 회원은 다음에 부모 화면을 열 때 동의 화면에서 agree_terms()로 기록
--  2. children: 보호자(법정대리인)가 자녀 정보 처리에 동의한 시각·동의한 보호자
--     - 자녀 추가 화면에서 동의해야 추가할 수 있고, 추가될 때 DB가 시각을 기록
--     - 기존 자녀는 동의 화면에서 agree_terms(..., true)로 기록
--  3. delete_my_account(): 회원 탈퇴. 가족에 다른 보호자가 없으면 가족·자녀·학습 기록 전부 삭제
--  4. 자녀 프로필을 지우면 계정 개편 전의 옛 학생 로그인 계정(이름·이메일)도 함께 삭제
-- =============================================

BEGIN;

-- ---------- 1. 동의 기록 칸 ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version   text,
  ADD COLUMN IF NOT EXISTS terms_agreed_at timestamptz;

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS guardian_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_consent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 클라이언트가 바꿀 수 있는 칸은 그대로 (profiles: name / children: 이름·학습 설정).
-- 동의 칸은 아래 트리거·함수로만 기록된다.

-- ---------- 2. 자녀 추가 시 동의 기록 ----------
-- 자녀 추가 화면은 법정대리인 동의에 체크해야 추가 버튼이 눌린다.
-- 시각과 동의한 보호자는 클라이언트가 보낸 값 대신 DB가 채운다.
CREATE OR REPLACE FUNCTION public.stamp_guardian_consent()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.guardian_consent_at := now();
  NEW.guardian_consent_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS children_stamp_guardian_consent ON public.children;
CREATE TRIGGER children_stamp_guardian_consent
  BEFORE INSERT ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.stamp_guardian_consent();

-- ---------- 3. 회원가입 트리거: 약관 동의 기록 추가 ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam       uuid;
  user_role text := COALESCE(new.raw_user_meta_data->>'role', 'parent');
  terms     text := left(NULLIF(btrim(new.raw_user_meta_data->>'terms_version'), ''), 20);
BEGIN
  INSERT INTO public.profiles (id, email, name, role, terms_version, terms_agreed_at)
  VALUES (
    new.id,
    COALESCE(new.email, ''),  -- 이메일 없는 소셜 로그인 대비
    COALESCE(new.raw_user_meta_data->>'name', ''),
    user_role,
    terms,
    CASE WHEN terms IS NULL THEN NULL ELSE now() END
  )
  ON CONFLICT (id) DO NOTHING;

  IF user_role = 'parent' THEN
    INSERT INTO public.families (name) VALUES ('') RETURNING id INTO fam;
    INSERT INTO public.family_members (family_id, user_id, role) VALUES (fam, new.id, 'owner');
  END IF;
  RETURN new;
END;
$$;

-- ---------- 4. 기존 회원 동의 ----------
-- with_children = true 이면 아직 동의 기록이 없는 내 가족 자녀도 법정대리인 동의로 기록
CREATE OR REPLACE FUNCTION public.agree_terms(version text, with_children boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  v  text := NULLIF(btrim(version), '');
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF v IS NULL OR char_length(v) > 20 THEN
    RAISE EXCEPTION 'invalid terms version';
  END IF;

  UPDATE public.profiles SET terms_version = v, terms_agreed_at = now() WHERE id = me;

  IF with_children THEN
    UPDATE public.children
    SET guardian_consent_at = now(), guardian_consent_by = me
    WHERE family_id = public.my_family_id() AND guardian_consent_at IS NULL;
  END IF;
END;
$$;

-- ---------- 5. 옛 학생 로그인 계정 정리 ----------
-- 계정 개편 전에는 아이도 로그인 계정이었고, 자녀 프로필 id = 그 계정 id.
-- 자녀 프로필을 지우면 남아 있는 옛 계정(이름·가짜 이메일)도 함께 지운다.
CREATE OR REPLACE FUNCTION public.delete_legacy_student_account()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM auth.users u
  WHERE u.id = OLD.id
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.id AND p.role = 'student');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS children_delete_legacy_account ON public.children;
CREATE TRIGGER children_delete_legacy_account
  AFTER DELETE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.delete_legacy_student_account();

-- ---------- 6. 회원 탈퇴 ----------
-- 가족에 다른 보호자가 없으면: 가족 → 자녀 → 단어 세트·학습 기록·보상·단어별 학습 상태·PIN 전부 삭제(CASCADE)
-- 다른 보호자가 있으면: 가족과 자녀는 남기고, 내가 등록한 숙제는 남은 보호자 이름으로 옮김
-- 마지막으로 로그인 계정을 지우면 프로필·가족 구성원 기록도 CASCADE로 삭제
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me      uuid := auth.uid();
  fam     uuid;
  my_role text;
  heir    uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT family_id, role INTO fam, my_role FROM public.family_members WHERE user_id = me;

  IF fam IS NOT NULL THEN
    SELECT user_id INTO heir
    FROM public.family_members
    WHERE family_id = fam AND user_id <> me
    ORDER BY (role = 'owner') DESC, created_at
    LIMIT 1;

    IF heir IS NULL THEN
      DELETE FROM public.families WHERE id = fam;
    ELSE
      UPDATE public.word_sets SET parent_id = heir WHERE parent_id = me;
      IF my_role = 'owner' THEN
        UPDATE public.family_members SET role = 'owner' WHERE family_id = fam AND user_id = heir;
      END IF;
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = me;
END;
$$;

-- ---------- 7. 실행 권한 ----------
REVOKE ALL ON FUNCTION public.stamp_guardian_consent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_legacy_student_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agree_terms(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agree_terms(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMIT;

-- =============================================
-- 실행 후 확인 (결과 1행)
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--        WHERE table_schema = 'public'
--          AND (table_name, column_name) IN (('profiles', 'terms_version'), ('profiles', 'terms_agreed_at'),
--                                            ('children', 'guardian_consent_at'), ('children', 'guardian_consent_by')))
--       AS new_columns,              -- 4 이면 정상
--     (SELECT count(*) FROM pg_proc WHERE proname IN ('agree_terms', 'delete_my_account')) AS functions,  -- 2
--     has_table_privilege('postgres', 'auth.users', 'DELETE') AS can_delete_users;                         -- true
-- =============================================
