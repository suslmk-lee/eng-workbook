-- =============================================
-- 오늘의 학습 (1단계)
--  1. 자녀별 학습 설정: 학년, 하루 새 단어 수, 자동 학습 켜기/끄기
--  2. 단어 세트 출처: 부모가 넣은 숙제(parent) / 자동으로 만든 오늘의 학습(auto)
--  3. 단어 ↔ 공용 사전 연결 (예문 표시용)
--  4. 아이별 단어 학습 상태(child_word_progress): 학습 기록이 저장될 때마다 자동 갱신
--     - 다른 날 연속으로 맞히면 복습 간격이 1→2→4→7→15→30→60일로 늘어남
--     - 틀리면 다음 날 다시 복습. 플래시카드(카드 넘기기)는 정답 판정이 아니라 "봤음"으로만 기록
--     - 같은 단어는 숙제·자동 학습 어디서 나와도 하나로 관리
--  5. ensure_daily_lesson(): 아이가 앱을 열면 그날의 학습 세트를 만들어 준다
--     - 복습할 단어(최근 틀린 단어 먼저, 최대 10개) + 새 단어(학년 수준, 하루 기본 5개)
--     - 부모 숙제가 있는 날은 새 단어 없이 복습만 (복습할 단어가 4개 미만이면 만들지 않음)
--     - 퀴즈 보기를 위해 최소 4단어
-- 날짜 기준: 한국 시간(Asia/Seoul)
-- 먼저 20261110100000_dictionary.sql이 적용되어 있어야 합니다.
-- =============================================

BEGIN;

-- ---------- 1. 자녀 학습 설정 ----------
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS grade smallint NOT NULL DEFAULT 3 CHECK (grade BETWEEN 0 AND 6),  -- 0: 영어 처음, 1~6: 초1~초6
  ADD COLUMN IF NOT EXISTS daily_new_words smallint NOT NULL DEFAULT 5 CHECK (daily_new_words BETWEEN 3 AND 10),
  ADD COLUMN IF NOT EXISTS auto_lesson boolean NOT NULL DEFAULT true;

GRANT UPDATE (grade, daily_new_words, auto_lesson) ON public.children TO authenticated;

-- ---------- 2. 단어 세트 출처 ----------
ALTER TABLE public.word_sets
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'parent' CHECK (source IN ('parent', 'auto'));

CREATE UNIQUE INDEX IF NOT EXISTS word_sets_one_auto_lesson_per_day
  ON public.word_sets (child_id, date) WHERE source = 'auto';

-- ---------- 3. 단어 ↔ 사전 ----------
ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS dictionary_word_id bigint REFERENCES public.dictionary_words(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lesson_role text CHECK (lesson_role IN ('new', 'review'));

-- 부모가 넣은 단어도 사전에 있으면 자동으로 연결 (예문을 보여줄 수 있게)
CREATE OR REPLACE FUNCTION public.link_word_to_dictionary()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.dictionary_word_id IS NULL THEN
    SELECT id INTO NEW.dictionary_word_id
    FROM public.dictionary_words
    WHERE english = lower(btrim(NEW.english));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS words_link_dictionary ON public.words;
CREATE TRIGGER words_link_dictionary
  BEFORE INSERT ON public.words
  FOR EACH ROW EXECUTE FUNCTION public.link_word_to_dictionary();

UPDATE public.words w
SET dictionary_word_id = d.id
FROM public.dictionary_words d
WHERE w.dictionary_word_id IS NULL AND d.english = lower(btrim(w.english));

-- ---------- 4. 아이별 단어 학습 상태 ----------
CREATE TABLE IF NOT EXISTS public.child_word_progress (
  child_id           uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  english            text NOT NULL,          -- 소문자. 숙제·자동 학습의 같은 단어를 하나로
  korean             text,                   -- 마지막으로 본 뜻
  dictionary_word_id bigint REFERENCES public.dictionary_words(id) ON DELETE SET NULL,
  first_seen         date NOT NULL,
  correct_count      int NOT NULL DEFAULT 0,
  wrong_count        int NOT NULL DEFAULT 0,
  streak             int NOT NULL DEFAULT 0, -- 서로 다른 날 연속으로 맞힌 횟수
  interval_days      int NOT NULL DEFAULT 1,
  next_review_date   date NOT NULL,
  last_step_date     date,                   -- 복습 간격을 마지막으로 바꾼 날 (하루 한 번만 늘림)
  last_wrong_date    date,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, english)
);

CREATE INDEX IF NOT EXISTS idx_child_word_progress_due
  ON public.child_word_progress (child_id, next_review_date);

ALTER TABLE public.child_word_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS child_word_progress_select ON public.child_word_progress;
CREATE POLICY child_word_progress_select ON public.child_word_progress FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
-- 쓰기는 학습 기록 트리거로만
REVOKE INSERT, UPDATE, DELETE ON public.child_word_progress FROM anon, authenticated;

-- 학습 결과 1건 반영
CREATE OR REPLACE FUNCTION public.apply_word_result(
  p_child uuid, p_english text, p_korean text, p_dictionary_word_id bigint,
  p_correct boolean, p_module text, p_day date
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  intervals constant int[] := ARRAY[1, 2, 4, 7, 15, 30, 60];
  p public.child_word_progress%ROWTYPE;
BEGIN
  INSERT INTO public.child_word_progress (child_id, english, korean, dictionary_word_id, first_seen, next_review_date)
  VALUES (p_child, p_english, p_korean, p_dictionary_word_id, p_day, p_day + 1)
  ON CONFLICT (child_id, english) DO UPDATE SET
    korean = COALESCE(EXCLUDED.korean, child_word_progress.korean),
    dictionary_word_id = COALESCE(child_word_progress.dictionary_word_id, EXCLUDED.dictionary_word_id)
  RETURNING * INTO p;

  -- 플래시카드는 "봤음"만 기록 (정답 판정이 아님)
  IF p_module = 'flashcard' THEN
    RETURN;
  END IF;

  IF p_correct THEN
    p.correct_count := p.correct_count + 1;
    IF p.last_step_date IS NULL OR p.last_step_date < p_day THEN
      p.streak := p.streak + 1;
      p.interval_days := intervals[LEAST(p.streak, array_length(intervals, 1))];
      p.next_review_date := p_day + p.interval_days;
      p.last_step_date := p_day;
    END IF;
  ELSE
    p.wrong_count := p.wrong_count + 1;
    p.streak := 0;
    p.interval_days := 1;
    p.next_review_date := p_day + 1;
    p.last_step_date := p_day;
    p.last_wrong_date := p_day;
  END IF;

  UPDATE public.child_word_progress SET
    correct_count = p.correct_count,
    wrong_count = p.wrong_count,
    streak = p.streak,
    interval_days = p.interval_days,
    next_review_date = p.next_review_date,
    last_step_date = p.last_step_date,
    last_wrong_date = p.last_wrong_date,
    updated_at = now()
  WHERE child_id = p_child AND english = p_english;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_word_result(uuid, text, text, bigint, boolean, text, date) FROM PUBLIC, anon, authenticated;

-- 기존 학습 기록으로 처음 상태 만들기 (처음 한 번만)
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.child_word_progress) THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT lr.student_id, lower(btrim(w.english)) AS english, w.korean, w.dictionary_word_id,
           lr.is_correct, lr.module_type, (lr.created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM public.learning_records lr
    JOIN public.words w ON w.id = lr.word_id
    JOIN public.children c ON c.id = lr.student_id
    ORDER BY lr.created_at, lr.id
  LOOP
    PERFORM public.apply_word_result(r.student_id, r.english, r.korean, r.dictionary_word_id,
                                     r.is_correct, r.module_type, r.day);
  END LOOP;
END $$;

-- 앞으로 저장되는 학습 기록마다 자동 반영
CREATE OR REPLACE FUNCTION public.on_learning_record()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
BEGIN
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT lower(btrim(english)) AS english, korean, dictionary_word_id INTO w
  FROM public.words WHERE id = NEW.word_id;
  IF FOUND AND EXISTS (SELECT 1 FROM public.children WHERE id = NEW.student_id) THEN
    PERFORM public.apply_word_result(NEW.student_id, w.english, w.korean, w.dictionary_word_id,
                                     NEW.is_correct, NEW.module_type,
                                     (NEW.created_at AT TIME ZONE 'Asia/Seoul')::date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_records_update_progress ON public.learning_records;
CREATE TRIGGER learning_records_update_progress
  AFTER INSERT ON public.learning_records
  FOR EACH ROW EXECUTE FUNCTION public.on_learning_record();

-- ---------- 5. 오늘의 학습 만들기 ----------
-- 호출한 학부모 권한(RLS)으로 실행: 내 가족 자녀에게만 만들 수 있다.
-- 이미 있으면 그 세트 id, 만들 게 없으면 NULL
CREATE OR REPLACE FUNCTION public.ensure_daily_lesson(
  p_child uuid,
  p_day date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c           public.children%ROWTYPE;
  v_set       uuid;
  v_start     int;
  v_homework  boolean;
  v_reviews   int;
  v_new       int;
  v_count     int;
BEGIN
  SELECT * INTO c FROM public.children WHERE id = p_child;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'child not found';
  END IF;

  SELECT id INTO v_set FROM public.word_sets
  WHERE child_id = p_child AND date = p_day AND source = 'auto';
  IF FOUND THEN
    RETURN v_set;
  END IF;

  IF NOT c.auto_lesson THEN
    RETURN NULL;
  END IF;

  -- 학년 → 시작 레벨: 영어 처음·초1·초2 → 1, 초3 → 2, … 초6 → 5
  v_start := CASE WHEN c.grade <= 2 THEN 1 ELSE LEAST(c.grade - 1, 5) END;
  v_homework := EXISTS (
    SELECT 1 FROM public.word_sets
    WHERE child_id = p_child AND date = p_day AND source = 'parent'
  );

  SELECT count(*) INTO v_reviews FROM (
    SELECT 1 FROM public.child_word_progress
    WHERE child_id = p_child AND next_review_date <= p_day
    LIMIT 10
  ) due;

  IF v_homework AND v_reviews < 4 THEN
    RETURN NULL;  -- 숙제 있는 날은 복습이 충분할 때만
  END IF;
  v_new := CASE WHEN v_homework THEN 0 ELSE c.daily_new_words END;
  v_new := GREATEST(v_new, 4 - v_reviews);

  INSERT INTO public.word_sets (title, date, parent_id, child_id, source)
  VALUES ('오늘의 학습', p_day, auth.uid(), p_child, 'auto')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_set;

  IF v_set IS NULL THEN
    -- 다른 기기에서 방금 만든 경우
    SELECT id INTO v_set FROM public.word_sets
    WHERE child_id = p_child AND date = p_day AND source = 'auto';
    RETURN v_set;
  END IF;

  INSERT INTO public.words (word_set_id, english, korean, dictionary_word_id, lesson_role)
  SELECT v_set, x.english, x.korean, x.dictionary_word_id, x.role
  FROM (
    (
      SELECT p.english, COALESCE(p.korean, d.korean) AS korean, p.dictionary_word_id,
             'review'::text AS role, 2 AS grp,
             row_number() OVER (
               ORDER BY (p.last_wrong_date IS NOT NULL AND p.last_wrong_date >= p_day - 7) DESC,
                        p.next_review_date, p.english
             ) AS ord
      FROM public.child_word_progress p
      LEFT JOIN public.dictionary_words d ON d.id = p.dictionary_word_id
      WHERE p.child_id = p_child AND p.next_review_date <= p_day
      ORDER BY ord
      LIMIT 10
    )
    UNION ALL
    (
      SELECT d.english, d.korean, d.id, 'new'::text, 1,
             row_number() OVER (ORDER BY (d.level < v_start), d.level, d.sort_order)
      FROM public.dictionary_words d
      WHERE NOT EXISTS (
              SELECT 1 FROM public.child_word_progress p
              WHERE p.child_id = p_child AND p.english = d.english
            )
        AND NOT EXISTS (  -- 부모 숙제에 이미 나온 단어는 새 단어로 내지 않음
              SELECT 1 FROM public.words w
              JOIN public.word_sets s ON s.id = w.word_set_id
              WHERE s.child_id = p_child AND s.source = 'parent' AND lower(btrim(w.english)) = d.english
            )
      ORDER BY (d.level < v_start), d.level, d.sort_order
      LIMIT v_new
    )
  ) x
  ORDER BY x.grp, x.ord;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count < 4 THEN
    -- 낼 단어가 모자람 (사전을 다 배운 경우 등)
    DELETE FROM public.word_sets WHERE id = v_set;
    RETURN NULL;
  END IF;
  RETURN v_set;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daily_lesson(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_daily_lesson(uuid, date) TO authenticated;

COMMIT;
