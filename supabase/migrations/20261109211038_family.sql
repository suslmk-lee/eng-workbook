-- =============================================
-- 계정 구조 개편 (2단계): 학부모 계정 + 자녀 프로필
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고, 여러 번 실행해도 결과가 같습니다.
-- 먼저 supabase/migrations/20261109074851_security.sql이 적용되어 있어야 합니다.
--
-- 바뀌는 것
--  - 아이는 더 이상 로그인 계정이 아니라, 가족(families)에 속한 "자녀 프로필"(children)
--  - 부모가 기기에서 로그인 → 아이가 프로필 선택 → 자녀 모드.
--    부모 화면으로 돌아갈 때는 부모 PIN(4자리) 확인
--  - 가족 단위라서 나중에 엄마·아빠 두 계정이 한 가족을 함께 관리할 수 있음(초대 기능 예정)
--
-- 기존 데이터
--  - parent_child로 연결된 학부모·자녀를 묶어 가족을 만듦 (연결된 덩어리 하나 = 가족 하나)
--  - 자녀 프로필 id = 기존 학생 계정 id → 학습 기록·보상·단어 세트가 그대로 이어짐
--  - 학습 데이터의 FK를 profiles → children으로 옮김. 기존 학생 로그인 계정은 지우지 않음
--  - 어느 부모와도 연결되지 않은 옛 기록은 지우지 않고 그대로 둠(접근만 불가)
--
-- 문제가 생기면 supabase/rollback/20261109211038_family_rollback.sql 참고
-- =============================================

BEGIN;

-- ---------- 1. 새 테이블 ----------
CREATE TABLE IF NOT EXISTS public.families (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 가족을 관리하는 학부모 계정. 한 계정은 한 가족에만 속함
CREATE TABLE IF NOT EXISTS public.family_members (
  family_id  UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'guardian' CHECK (role IN ('owner', 'guardian')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

-- 부모 PIN. 클라이언트는 읽을 수 없고 아래 함수로만 확인·변경
CREATE TABLE IF NOT EXISTS public.family_secrets (
  family_id  UUID PRIMARY KEY REFERENCES public.families(id) ON DELETE CASCADE,
  pin_salt   TEXT NOT NULL,
  pin_hash   TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.children (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_children_family ON public.children(family_id);
CREATE INDEX IF NOT EXISTS idx_review_schedules_student ON public.review_schedules(student_id);

-- ---------- 2. 권한 확인 함수 ----------
-- RLS 정책 안에서 쓰므로 SECURITY DEFINER (정책끼리 서로 참조하며 무한 반복하는 것 방지)
CREATE OR REPLACE FUNCTION public.my_family_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM public.family_members WHERE user_id = auth.uid()
$$;

-- 자녀 추가 시 family_id를 비워두면 내 가족으로
ALTER TABLE public.children ALTER COLUMN family_id SET DEFAULT public.my_family_id();

-- ---------- 3. 기존 데이터 → 가족·자녀 프로필 ----------
DO $$
DECLARE
  seed  uuid;
  fam   uuid;
  added int;
BEGIN
  CREATE TEMP TABLE _parents (id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE _kids    (id uuid PRIMARY KEY) ON COMMIT DROP;

  -- 가족이 없는 학부모마다, parent_child로 이어진 학부모·자녀 전체를 한 가족으로
  FOR seed IN
    SELECT p.id FROM public.profiles p
    WHERE p.role = 'parent'
      AND NOT EXISTS (SELECT 1 FROM public.family_members m WHERE m.user_id = p.id)
    ORDER BY p.created_at, p.id
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.family_members m WHERE m.user_id = seed);

    TRUNCATE _parents;
    TRUNCATE _kids;
    INSERT INTO _parents VALUES (seed);

    LOOP
      INSERT INTO _kids
        SELECT DISTINCT pc.child_id
        FROM public.parent_child pc
        JOIN _parents p ON p.id = pc.parent_id
        JOIN public.profiles c ON c.id = pc.child_id AND c.role = 'student'
        WHERE NOT EXISTS (SELECT 1 FROM public.children ch WHERE ch.id = pc.child_id)
      ON CONFLICT DO NOTHING;

      INSERT INTO _parents
        SELECT DISTINCT pc.parent_id
        FROM public.parent_child pc
        JOIN _kids k ON k.id = pc.child_id
        JOIN public.profiles p ON p.id = pc.parent_id AND p.role = 'parent'
        WHERE NOT EXISTS (SELECT 1 FROM public.family_members m WHERE m.user_id = pc.parent_id)
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS added = ROW_COUNT;
      EXIT WHEN added = 0;
    END LOOP;

    INSERT INTO public.families (name) VALUES ('') RETURNING id INTO fam;

    INSERT INTO public.family_members (family_id, user_id, role)
      SELECT fam, p.id, CASE WHEN p.id = seed THEN 'owner' ELSE 'guardian' END
      FROM _parents p
    ON CONFLICT DO NOTHING;

    INSERT INTO public.children (id, family_id, name, created_at)
      SELECT k.id, fam, left(COALESCE(NULLIF(btrim(pr.name), ''), '아이'), 30), pr.created_at
      FROM _kids k
      JOIN public.profiles pr ON pr.id = k.id
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- ---------- 4. 학습 데이터의 FK: profiles → children ----------
DO $$
DECLARE
  t   record;
  con record;
  fk  text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('word_sets', 'child_id'),
      ('learning_records', 'student_id'),
      ('review_schedules', 'student_id'),
      ('rewards', 'student_id')
    ) AS v(tbl, col)
  LOOP
    -- 기존 FK(→ profiles) 제거. 이름이 달라도 찾아서 지움
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = format('public.%I', t.tbl)::regclass
        AND c.confrelid = 'public.profiles'::regclass
        AND a.attname = t.col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.tbl, con.conname);
    END LOOP;

    -- 새 FK(→ children). 자녀를 지우면 그 아이의 기록도 함께 삭제
    fk := format('%s_%s_child_fkey', t.tbl, t.col);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
        'REFERENCES public.children(id) ON DELETE CASCADE NOT VALID',
        t.tbl, fk, t.col
      );
    END IF;

    -- 연결 안 된 옛 기록이 없으면 기존 행까지 검사 완료로 표시. 있으면 새 행부터만 검사
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t.tbl, fk);
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE '%: 가족에 속하지 않은 옛 기록이 있어 기존 행 검사는 건너뜀', t.tbl;
    END;
  END LOOP;
END $$;

-- ---------- 5. 회원가입 트리거: 학부모 가입 시 가족 자동 생성 ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam       uuid;
  user_role text := COALESCE(new.raw_user_meta_data->>'role', 'parent');
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    COALESCE(new.email, ''),  -- 이메일 없는 소셜 로그인 대비
    COALESCE(new.raw_user_meta_data->>'name', ''),
    user_role
  )
  ON CONFLICT (id) DO NOTHING;

  IF user_role = 'parent' THEN
    INSERT INTO public.families (name) VALUES ('') RETURNING id INTO fam;
    INSERT INTO public.family_members (family_id, user_id, role) VALUES (fam, new.id, 'owner');
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- 6. 부모 PIN 함수 ----------
CREATE OR REPLACE FUNCTION public.has_parent_pin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_secrets WHERE family_id = public.my_family_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.verify_parent_pin(pin text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_secrets s
    WHERE s.family_id = public.my_family_id()
      AND s.pin_hash = encode(sha256(convert_to(s.pin_salt || pin, 'UTF8')), 'hex')
  )
$$;

-- PIN 설정·변경. 이미 PIN이 있으면 현재 PIN이 맞거나,
-- 10분 안에 비밀번호로 다시 로그인한 경우(PIN 분실)에만 바꿀 수 있음
CREATE OR REPLACE FUNCTION public.set_parent_pin(new_pin text, current_pin text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam          uuid := public.my_family_id();
  salt         text := gen_random_uuid()::text;
  signed_in_at bigint;
BEGIN
  IF fam IS NULL THEN
    RAISE EXCEPTION 'no family';
  END IF;
  IF new_pin IS NULL OR new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be 4 digits';
  END IF;

  IF EXISTS (SELECT 1 FROM public.family_secrets WHERE family_id = fam)
     AND NOT public.verify_parent_pin(current_pin) THEN
    SELECT max((a->>'timestamp')::bigint) INTO signed_in_at
    FROM jsonb_array_elements(COALESCE(auth.jwt()->'amr', '[]'::jsonb)) AS a;
    IF signed_in_at IS NULL OR signed_in_at < extract(epoch FROM now()) - 600 THEN
      RAISE EXCEPTION 'current PIN required';
    END IF;
  END IF;

  INSERT INTO public.family_secrets (family_id, pin_salt, pin_hash, updated_at)
  VALUES (fam, salt, encode(sha256(convert_to(salt || new_pin, 'UTF8')), 'hex'), now())
  ON CONFLICT (family_id) DO UPDATE
    SET pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.has_parent_pin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_parent_pin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_parent_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_parent_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_parent_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_parent_pin(text, text) TO authenticated;

-- ---------- 7. RLS 정책 (전부 지우고 다시) ----------
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'parent_child', 'families', 'family_members', 'family_secrets', 'children',
        'word_sets', 'words', 'learning_records', 'review_schedules', 'rewards'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_child     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_secrets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards          ENABLE ROW LEVEL SECURITY;

-- profiles: 본인 + 같은 가족 학부모. 클라이언트는 name만 수정
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR id IN (SELECT m.user_id FROM public.family_members m WHERE m.family_id = public.my_family_id())
  );
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name) ON public.profiles TO authenticated;

-- parent_child: 옛 연결 테이블. 정책 없음 = 클라이언트 접근 불가 (데이터는 보존)

-- families: 내 가족만. 이름만 수정
CREATE POLICY families_select ON public.families FOR SELECT
  USING (id = public.my_family_id());
CREATE POLICY families_update ON public.families FOR UPDATE
  USING (id = public.my_family_id()) WITH CHECK (id = public.my_family_id());
REVOKE INSERT, UPDATE, DELETE ON public.families FROM anon, authenticated;
GRANT UPDATE (name) ON public.families TO authenticated;

-- family_members: 내 가족 구성원 조회만 (추가는 초대 기능에서 함수로)
CREATE POLICY family_members_select ON public.family_members FOR SELECT
  USING (family_id = public.my_family_id());
REVOKE INSERT, UPDATE, DELETE ON public.family_members FROM anon, authenticated;

-- family_secrets: 클라이언트 접근 불가
REVOKE ALL ON public.family_secrets FROM anon, authenticated;

-- children: 내 가족 자녀만 조회·추가·이름 변경·삭제
CREATE POLICY children_select ON public.children FOR SELECT
  USING (family_id = public.my_family_id());
CREATE POLICY children_insert ON public.children FOR INSERT
  WITH CHECK (family_id = public.my_family_id());
CREATE POLICY children_update ON public.children FOR UPDATE
  USING (family_id = public.my_family_id()) WITH CHECK (family_id = public.my_family_id());
CREATE POLICY children_delete ON public.children FOR DELETE
  USING (family_id = public.my_family_id());
REVOKE UPDATE ON public.children FROM anon, authenticated;
GRANT UPDATE (name) ON public.children TO authenticated;

-- 학습 데이터: 모두 "내 가족 자녀" 기준
CREATE POLICY word_sets_select ON public.word_sets FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY word_sets_insert ON public.word_sets FOR INSERT
  WITH CHECK (
    parent_id = auth.uid()
    AND child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id())
  );
CREATE POLICY word_sets_delete ON public.word_sets FOR DELETE
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));

CREATE POLICY words_select ON public.words FOR SELECT
  USING (word_set_id IN (
    SELECT ws.id FROM public.word_sets ws
    WHERE ws.child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id())
  ));
CREATE POLICY words_insert ON public.words FOR INSERT
  WITH CHECK (word_set_id IN (
    SELECT ws.id FROM public.word_sets ws
    WHERE ws.child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id())
  ));

CREATE POLICY learning_records_select ON public.learning_records FOR SELECT
  USING (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY learning_records_insert ON public.learning_records FOR INSERT
  WITH CHECK (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));

CREATE POLICY review_schedules_select ON public.review_schedules FOR SELECT
  USING (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY review_schedules_insert ON public.review_schedules FOR INSERT
  WITH CHECK (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY review_schedules_update ON public.review_schedules FOR UPDATE
  USING (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()))
  WITH CHECK (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));

CREATE POLICY rewards_select ON public.rewards FOR SELECT
  USING (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY rewards_insert ON public.rewards FOR INSERT
  WITH CHECK (student_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));

COMMIT;

-- =============================================
-- 실행 후 확인 (결과 1행)
--   SELECT
--     (SELECT count(*) FROM public.families)       AS families,
--     (SELECT count(*) FROM public.family_members) AS parents,
--     (SELECT count(*) FROM public.children)       AS children,
--     (SELECT count(*) FROM public.profiles p WHERE p.role = 'parent'
--        AND NOT EXISTS (SELECT 1 FROM public.family_members m WHERE m.user_id = p.id))
--       AS parents_without_family,   -- 0 이면 정상
--     (SELECT count(*) FROM public.learning_records r
--        WHERE r.student_id IS NOT NULL
--          AND NOT EXISTS (SELECT 1 FROM public.children c WHERE c.id = r.student_id))
--       AS orphan_records;           -- 가족에 속하지 않은 옛 기록 수 (참고용)
-- =============================================
