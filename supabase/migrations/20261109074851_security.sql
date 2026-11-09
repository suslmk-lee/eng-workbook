-- =============================================
-- 보안 정비 마이그레이션 (공개 전 0단계)
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고,
-- 여러 번 실행해도 결과가 같습니다.
--
-- 고치는 것
--  1. 아무 학부모나 parent_child에 행을 넣어 남의 아이와 "연결"할 수 있던 문제
--     (연결되면 그 아이의 PIN 재설정·계정 전환이 가능했음)
--     → 연결은 서버(/api/children, service_role)에서만 만들 수 있음
--  2. 사용자가 자기 profiles.role을 바꿔 학부모 권한을 얻을 수 있던 문제
--     → 클라이언트는 profiles.name만 수정 가능
--  3. 학부모가 자기 자녀가 아닌 아이에게 단어 세트·복습 일정을 넣을 수 있던 문제
--  4. 저장소 SQL과 실제 DB 정책이 어긋났을 가능성
--     → 앱이 쓰는 7개 테이블의 정책을 모두 지우고, 아래 정책만 다시 만듦
--
-- 실행 전에 현재 정책을 확인하려면:
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
-- =============================================

BEGIN;

-- 0. 기존 정책 전부 제거 (이름이 달라도 지워지도록 pg_policies 기준)
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'parent_child', 'word_sets', 'words',
        'learning_records', 'review_schedules', 'rewards'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_child     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards          ENABLE ROW LEVEL SECURITY;

-- 1. profiles: 본인 + (학부모라면) 연결된 자녀만 조회
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_select_linked_child ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.parent_child pc
    WHERE pc.parent_id = auth.uid() AND pc.child_id = profiles.id
  ));

-- 회원가입 트리거(handle_new_user)가 없는 환경을 위한 대비용
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- role·email은 클라이언트에서 못 바꾸게 컬럼 단위로 제한 (service_role은 영향 없음)
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name) ON public.profiles TO authenticated;

-- 2. parent_child: 조회·연결 해제만 허용. 추가·수정 정책 없음 = 서버에서만 연결
CREATE POLICY parent_child_select ON public.parent_child FOR SELECT
  USING (auth.uid() = parent_id OR auth.uid() = child_id);

CREATE POLICY parent_child_delete ON public.parent_child FOR DELETE
  USING (auth.uid() = parent_id);

-- 3. word_sets: 학부모는 "연결된 자기 자녀"에게만 등록 가능
CREATE POLICY word_sets_select ON public.word_sets FOR SELECT
  USING (auth.uid() = parent_id OR auth.uid() = child_id);

CREATE POLICY word_sets_insert ON public.word_sets FOR INSERT
  WITH CHECK (
    auth.uid() = parent_id
    AND EXISTS (
      SELECT 1 FROM public.parent_child pc
      WHERE pc.parent_id = auth.uid() AND pc.child_id = word_sets.child_id
    )
  );

CREATE POLICY word_sets_delete ON public.word_sets FOR DELETE
  USING (auth.uid() = parent_id);

-- 4. words: 단어 세트 기준
CREATE POLICY words_select ON public.words FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.word_sets ws
    WHERE ws.id = words.word_set_id
      AND (ws.parent_id = auth.uid() OR ws.child_id = auth.uid())
  ));

CREATE POLICY words_insert ON public.words FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.word_sets ws
    WHERE ws.id = words.word_set_id AND ws.parent_id = auth.uid()
  ));

-- 5. learning_records: 학생 본인 기록 + 연결된 학부모 조회
CREATE POLICY learning_records_select ON public.learning_records FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_child pc
      WHERE pc.parent_id = auth.uid() AND pc.child_id = learning_records.student_id
    )
  );

CREATE POLICY learning_records_insert ON public.learning_records FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- 6. review_schedules: 학부모는 자기 단어 세트의 "배정된 자녀" 일정만 생성
CREATE POLICY review_schedules_select ON public.review_schedules FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY review_schedules_insert ON public.review_schedules FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.word_sets ws
      WHERE ws.id = review_schedules.word_set_id
        AND ws.parent_id = auth.uid()
        AND ws.child_id = review_schedules.student_id
    )
  );

CREATE POLICY review_schedules_update ON public.review_schedules FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- 7. rewards: 학생 본인 + 연결된 학부모 조회
CREATE POLICY rewards_select ON public.rewards FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_child pc
      WHERE pc.parent_id = auth.uid() AND pc.child_id = rewards.student_id
    )
  );

CREATE POLICY rewards_insert ON public.rewards FOR INSERT
  WITH CHECK (student_id = auth.uid());

COMMIT;

-- =============================================
-- 실행 후 확인 (선택)
-- 1) 정책 목록: 위 "실행 전 확인" 쿼리를 다시 실행 → 테이블별로 위 정책만 보여야 함
-- 2) 이상한 연결이 없는지: 결과가 0행이어야 정상
--   SELECT pc.*, p.role AS parent_role, c.role AS child_role
--   FROM public.parent_child pc
--   JOIN public.profiles p ON p.id = pc.parent_id
--   JOIN public.profiles c ON c.id = pc.child_id
--   WHERE p.role <> 'parent' OR c.role <> 'student';
-- =============================================
