-- =============================================
-- 학습 지속 장치 1차: 오늘의 목표, 연속 학습, 도장 달력, 이번 주 요약
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고, 여러 번 실행해도 결과가 같습니다.
-- 먼저 20261111100000_account_privacy.sql까지 적용되어 있어야 합니다.
--
-- 오늘의 목표
--   그날 숙제가 있으면 숙제 단어, 없으면 오늘의 학습 단어를 "모두 한 번 이상 맞히기"
--   (카드 넘기기는 정답 판정이 아니라서 빼고, 같은 영어 단어면 어느 세트에서 맞혀도 인정)
--   학습 기록이 저장될 때마다 DB가 진행 상황을 기록하고, 다 맞히면 그날 도장(met_at)을 찍는다.
--   도장은 한 번 찍히면 그날 숙제가 늘어나도 지우지 않는다.
--
-- 연속 학습 (매일, 주 1회는 쉬어도 이어짐)
--   목표를 못 채운 날이 있으면 그 주(월~일)의 "쉬는 날"로 쓰고 기록이 이어진다.
--   같은 주에 두 번째로 빠지면 끊긴다. 오늘은 아직 진행 중이라 끊기지 않는다.
--   오늘의 학습을 끈 아이는 숙제가 있는 날만 목표가 있는 날로 본다.
--   기능이 생긴 뒤(아이별로 처음 기록된 날)부터 센다.
-- 날짜 기준: 한국 시간(Asia/Seoul)
-- =============================================

BEGIN;

-- ---------- 1. 날마다 목표 진행 ----------
CREATE TABLE IF NOT EXISTS public.child_daily_goals (
  child_id   uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  day        date NOT NULL,
  goal_words int  NOT NULL DEFAULT 0,  -- 목표 단어 수 (마지막으로 계산했을 때)
  done_words int  NOT NULL DEFAULT 0,  -- 그중 맞힌 단어 수
  met_at     timestamptz,              -- 목표를 처음 다 채운 시각 = 도장
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, day)
);

ALTER TABLE public.child_daily_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS child_daily_goals_select ON public.child_daily_goals;
CREATE POLICY child_daily_goals_select ON public.child_daily_goals FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
REVOKE INSERT, UPDATE, DELETE ON public.child_daily_goals FROM anon, authenticated;

-- 하루치 학습 기록을 빨리 찾기 위한 색인
CREATE INDEX IF NOT EXISTS idx_learning_records_student_created
  ON public.learning_records (student_id, created_at);

-- ---------- 2. 목표 단어와 진행 계산 ----------
-- 그날의 목표 단어(소문자 영어): 숙제가 있으면 숙제, 없으면 오늘의 학습
CREATE OR REPLACE FUNCTION public.daily_goal_words(p_child uuid, p_day date)
RETURNS TABLE (english text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH day_sets AS (
    SELECT s.id, s.source
    FROM public.word_sets s
    WHERE s.child_id = p_child AND s.date = p_day AND s.source IN ('parent', 'auto')
  ), chosen AS (
    SELECT id FROM day_sets WHERE source = 'parent'
    UNION ALL
    SELECT id FROM day_sets
    WHERE source = 'auto' AND NOT EXISTS (SELECT 1 FROM day_sets WHERE source = 'parent')
  )
  SELECT DISTINCT lower(btrim(w.english))
  FROM public.words w
  JOIN chosen c ON c.id = w.word_set_id
  WHERE btrim(w.english) <> ''
$$;

-- 그날 맞힌 단어(소문자 영어). 카드 넘기기 제외
CREATE OR REPLACE FUNCTION public.daily_correct_words(p_child uuid, p_day date)
RETURNS TABLE (english text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT lower(btrim(w.english))
  FROM public.learning_records lr
  JOIN public.words w ON w.id = lr.word_id
  WHERE lr.student_id = p_child
    AND lr.is_correct
    AND lr.module_type <> 'flashcard'
    AND lr.created_at >= (p_day::timestamp AT TIME ZONE 'Asia/Seoul')
    AND lr.created_at <  ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
$$;

-- 그날 목표 진행을 다시 계산해 저장. 다 채웠으면 도장(처음 한 번만)
CREATE OR REPLACE FUNCTION public.refresh_daily_goal(p_child uuid, p_day date)
RETURNS public.child_daily_goals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_goal int;
  v_done int;
  r public.child_daily_goals;
BEGIN
  SELECT count(*) INTO v_goal FROM public.daily_goal_words(p_child, p_day);
  SELECT count(*) INTO v_done
  FROM public.daily_goal_words(p_child, p_day) g
  JOIN public.daily_correct_words(p_child, p_day) c ON c.english = g.english;

  INSERT INTO public.child_daily_goals (child_id, day, goal_words, done_words, met_at, updated_at)
  VALUES (p_child, p_day, v_goal, v_done,
          CASE WHEN v_goal > 0 AND v_done >= v_goal THEN now() END, now())
  ON CONFLICT (child_id, day) DO UPDATE SET
    goal_words = EXCLUDED.goal_words,
    done_words = EXCLUDED.done_words,
    met_at     = COALESCE(public.child_daily_goals.met_at, EXCLUDED.met_at),
    updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- 학습 기록이 저장될 때마다 그날 목표 갱신 (이미 도장을 찍은 날은 건너뜀)
CREATE OR REPLACE FUNCTION public.on_learning_record_goal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date;
BEGIN
  IF NEW.student_id IS NULL OR NEW.module_type = 'flashcard' OR NOT NEW.is_correct THEN
    RETURN NEW;
  END IF;
  v_day := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Seoul')::date;
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = NEW.student_id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.child_daily_goals
             WHERE child_id = NEW.student_id AND day = v_day AND met_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  PERFORM public.refresh_daily_goal(NEW.student_id, v_day);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_records_daily_goal ON public.learning_records;
CREATE TRIGGER learning_records_daily_goal
  AFTER INSERT ON public.learning_records
  FOR EACH ROW EXECUTE FUNCTION public.on_learning_record_goal();

-- ---------- 3. 연속 학습 ----------
-- 처음 기록된 날부터 오늘까지 하루씩 보며 연속 기록을 센다.
-- 날마다 상태: met(도장) / rest(쉬는 날로 이어짐) / missed(빠짐) / none(목표 없는 날) / today(오늘, 진행 중)
-- 결과: {"current", "best", "rest_available"(이번 주 쉬는 날 남음), "days"(p_from부터 오늘까지 상태)}
CREATE OR REPLACE FUNCTION public.goal_streak(p_child uuid, p_today date, p_from date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auto  boolean;
  v_start date;
  d       date;
  st      text;
  wk      date;
  cur     int := 0;
  best    int := 0;
  rest_weeks date[] := '{}';
  met_days   date[];
  hw_days    date[];
  days    jsonb := '[]'::jsonb;
BEGIN
  SELECT auto_lesson INTO v_auto FROM public.children WHERE id = p_child;
  SELECT min(day) INTO v_start FROM public.child_daily_goals WHERE child_id = p_child;
  v_start := LEAST(COALESCE(v_start, p_today), p_today);

  SELECT COALESCE(array_agg(day), '{}') INTO met_days
  FROM public.child_daily_goals
  WHERE child_id = p_child AND met_at IS NOT NULL AND day BETWEEN v_start AND p_today;

  SELECT COALESCE(array_agg(DISTINCT date), '{}') INTO hw_days
  FROM public.word_sets
  WHERE child_id = p_child AND source = 'parent' AND date BETWEEN v_start AND p_today;

  d := v_start;
  WHILE d <= p_today LOOP
    IF d = ANY (met_days) THEN
      st := 'met';
      cur := cur + 1;
      best := GREATEST(best, cur);
    ELSIF d = p_today THEN
      st := 'today';
    ELSIF COALESCE(v_auto, true) OR d = ANY (hw_days) THEN
      wk := date_trunc('week', d::timestamp)::date;  -- 그 주 월요일
      IF cur > 0 AND NOT (wk = ANY (rest_weeks)) THEN
        st := 'rest';
        rest_weeks := rest_weeks || wk;
      ELSE
        st := 'missed';
        cur := 0;
        rest_weeks := '{}';
      END IF;
    ELSE
      st := 'none';
    END IF;

    IF d >= p_from THEN
      days := days || jsonb_build_object('day', d, 'status', st);
    END IF;
    d := d + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'current', cur,
    'best', best,
    'rest_available', NOT (date_trunc('week', p_today::timestamp)::date = ANY (rest_weeks)),
    'days', days
  );
END;
$$;

-- ---------- 4. 화면용: 오늘 목표 + 연속 + 이번 달 도장 + 이번 주 요약 ----------
CREATE OR REPLACE FUNCTION public.get_goal_status(p_child uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today      date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'Asia/Seoul'))::date;
  v_month_start date := date_trunc('month', (now() AT TIME ZONE 'Asia/Seoul'))::date;
  g         public.child_daily_goals;
  v_streak  jsonb;
  v_remaining jsonb;
  v_week    jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = p_child AND family_id = public.my_family_id()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  g := public.refresh_daily_goal(p_child, v_today);

  SELECT COALESCE(jsonb_agg(gw.english ORDER BY gw.english), '[]'::jsonb) INTO v_remaining
  FROM public.daily_goal_words(p_child, v_today) gw
  WHERE NOT EXISTS (
    SELECT 1 FROM public.daily_correct_words(p_child, v_today) c WHERE c.english = gw.english
  );

  v_streak := public.goal_streak(p_child, v_today, LEAST(v_month_start, v_week_start));

  SELECT jsonb_build_object(
    'studied_days', (SELECT count(DISTINCT (lr.created_at AT TIME ZONE 'Asia/Seoul')::date)
                     FROM public.learning_records lr
                     WHERE lr.student_id = p_child
                       AND lr.created_at >= (v_week_start::timestamp AT TIME ZONE 'Asia/Seoul')),
    'met_days', (SELECT count(*) FROM public.child_daily_goals
                 WHERE child_id = p_child AND day >= v_week_start AND met_at IS NOT NULL),
    'answers', (SELECT count(*) FROM public.learning_records lr
                WHERE lr.student_id = p_child AND lr.module_type <> 'flashcard'
                  AND lr.created_at >= (v_week_start::timestamp AT TIME ZONE 'Asia/Seoul')),
    'correct', (SELECT count(*) FROM public.learning_records lr
                WHERE lr.student_id = p_child AND lr.module_type <> 'flashcard' AND lr.is_correct
                  AND lr.created_at >= (v_week_start::timestamp AT TIME ZONE 'Asia/Seoul')),
    'new_words', (SELECT count(*) FROM public.child_word_progress
                  WHERE child_id = p_child AND first_seen >= v_week_start)
  ) INTO v_week;

  RETURN jsonb_build_object(
    'today', v_today,
    'goal_words', g.goal_words,
    'done_words', g.done_words,
    'met', g.met_at IS NOT NULL,
    'met_at', g.met_at,
    'remaining', v_remaining,
    'streak', v_streak->'current',
    'best_streak', v_streak->'best',
    'rest_available', v_streak->'rest_available',
    'days', v_streak->'days',
    'week_start', v_week_start,
    'week', v_week
  );
END;
$$;

-- ---------- 5. 실행 권한 ----------
REVOKE ALL ON FUNCTION public.daily_goal_words(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_correct_words(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_daily_goal(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_learning_record_goal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.goal_streak(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_goal_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_goal_status(uuid) TO authenticated;

COMMIT;

-- =============================================
-- 실행 후 확인 (결과 1행)
--   SELECT
--     to_regclass('public.child_daily_goals') IS NOT NULL AS goal_table,                    -- true
--     (SELECT count(*) FROM pg_proc WHERE proname IN
--        ('daily_goal_words', 'daily_correct_words', 'refresh_daily_goal',
--         'on_learning_record_goal', 'goal_streak', 'get_goal_status')) AS functions,         -- 6
--     (SELECT count(*) FROM pg_trigger WHERE tgname = 'learning_records_daily_goal') AS trg; -- 1
-- =============================================
