-- =============================================
-- 알파벳 익히기 ("영어 처음" 아이용)
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고, 여러 번 실행해도 결과가 같습니다.
-- 먼저 20261113100000_badges_promises.sql까지 적용되어 있어야 합니다.
--
--  1. 아이별 글자(A~Z) 학습 상태: 맞힌·틀린 횟수, 연속으로 맞힌 횟수
--     3번 연속으로 맞히면 "익힌 글자"(mastered_at). 한 번 익히면 나중에 틀려도 유지
--  2. 배지 추가: 알파벳 26자를 모두 익히면 "알파벳 26자" (배지 21개)
-- 알파벳 문제는 단어가 아니라서 learning_records(단어 학습 기록)에는 넣지 않는다
-- =============================================

BEGIN;

-- ---------- 1. 글자별 학습 상태 ----------
CREATE TABLE IF NOT EXISTS public.child_alphabet_progress (
  child_id      uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  letter        text NOT NULL CHECK (letter ~ '^[A-Z]$'),
  correct_count int  NOT NULL DEFAULT 0,
  wrong_count   int  NOT NULL DEFAULT 0,
  streak        int  NOT NULL DEFAULT 0,   -- 연속으로 맞힌 횟수 (틀리면 0)
  mastered_at   timestamptz,               -- 처음 3번 연속 맞힌 시각
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, letter)
);

ALTER TABLE public.child_alphabet_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS child_alphabet_progress_select ON public.child_alphabet_progress;
CREATE POLICY child_alphabet_progress_select ON public.child_alphabet_progress FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
REVOKE INSERT, UPDATE, DELETE ON public.child_alphabet_progress FROM anon, authenticated;

-- 한 문제 결과 기록
CREATE OR REPLACE FUNCTION public.record_alphabet_result(p_child uuid, p_letter text, p_correct boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_letter text := upper(btrim(p_letter));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = p_child AND family_id = public.my_family_id()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF v_letter !~ '^[A-Z]$' OR p_correct IS NULL THEN
    RAISE EXCEPTION 'invalid letter';
  END IF;

  INSERT INTO public.child_alphabet_progress AS p (child_id, letter, correct_count, wrong_count, streak, mastered_at)
  VALUES (p_child, v_letter, CASE WHEN p_correct THEN 1 ELSE 0 END, CASE WHEN p_correct THEN 0 ELSE 1 END,
          CASE WHEN p_correct THEN 1 ELSE 0 END, NULL)
  ON CONFLICT (child_id, letter) DO UPDATE SET
    correct_count = p.correct_count + CASE WHEN p_correct THEN 1 ELSE 0 END,
    wrong_count   = p.wrong_count + CASE WHEN p_correct THEN 0 ELSE 1 END,
    streak        = CASE WHEN p_correct THEN p.streak + 1 ELSE 0 END,
    mastered_at   = COALESCE(p.mastered_at, CASE WHEN p_correct AND p.streak + 1 >= 3 THEN now() END),
    updated_at    = now();
END;
$$;

-- ---------- 2. 배지: 알파벳 26자 ----------
CREATE OR REPLACE FUNCTION public.badge_catalog()
RETURNS TABLE (ord int, badge text, metric text, threshold int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    (1,  'first_day',   'studied_days',      1),
    (2,  'first_stamp', 'met_days',          1),
    (3,  'streak_3',    'best_streak',       3),
    (4,  'streak_7',    'best_streak',       7),
    (5,  'streak_14',   'best_streak',       14),
    (6,  'streak_30',   'best_streak',       30),
    (7,  'streak_100',  'best_streak',       100),
    (8,  'stamps_10',   'met_days',          10),
    (9,  'stamps_30',   'met_days',          30),
    (10, 'stamps_100',  'met_days',          100),
    (11, 'words_10',    'mastered_words',    10),
    (12, 'words_50',    'mastered_words',    50),
    (13, 'words_100',   'mastered_words',    100),
    (14, 'words_300',   'mastered_words',    300),
    (15, 'words_500',   'mastered_words',    500),
    (16, 'words_1000',  'mastered_words',    1000),
    (17, 'perfect_10',  'trophies',          10),
    (18, 'perfect_50',  'trophies',          50),
    (19, 'placement',   'placement',         1),
    (20, 'sentence_50', 'sentence_correct',  50),
    (21, 'alphabet_26', 'alphabet_mastered', 26)
  ) AS t(ord, badge, metric, threshold)
$$;

CREATE OR REPLACE FUNCTION public.child_reward_metrics(p_child uuid, p_today date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'studied_days', (SELECT count(DISTINCT (lr.created_at AT TIME ZONE 'Asia/Seoul')::date)
                     FROM public.learning_records lr WHERE lr.student_id = p_child),
    'met_days', (SELECT count(*) FROM public.child_daily_goals g
                 WHERE g.child_id = p_child AND g.met_at IS NOT NULL),
    'best_streak', COALESCE((public.goal_streak(p_child, p_today, p_today)->>'best')::int, 0),
    'mastered_words', (SELECT count(*) FROM public.child_word_progress p
                       WHERE p.child_id = p_child AND p.streak >= 3),
    'trophies', (SELECT count(*) FROM public.rewards r WHERE r.student_id = p_child AND r.type = 'trophy'),
    'placement', (SELECT CASE WHEN c.placement_done_at IS NOT NULL THEN 1 ELSE 0 END
                  FROM public.children c WHERE c.id = p_child),
    'sentence_correct', (SELECT count(*) FROM public.learning_records lr
                         WHERE lr.student_id = p_child AND lr.is_correct
                           AND lr.module_type IN ('cloze', 'ordering', 'shadowing')),
    'alphabet_mastered', (SELECT count(*) FROM public.child_alphabet_progress a
                          WHERE a.child_id = p_child AND a.mastered_at IS NOT NULL)
  )
$$;

-- ---------- 3. 실행 권한 ----------
REVOKE ALL ON FUNCTION public.child_reward_metrics(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_alphabet_result(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_alphabet_result(uuid, text, boolean) TO authenticated;

COMMIT;

-- =============================================
-- 실행 후 확인 (결과 1행)
--   SELECT
--     to_regclass('public.child_alphabet_progress') IS NOT NULL AS alphabet_table,       -- true
--     (SELECT count(*) FROM public.badge_catalog()) AS badges,                           -- 21
--     (SELECT count(*) FROM pg_proc WHERE proname = 'record_alphabet_result') AS fn;     -- 1
-- =============================================
