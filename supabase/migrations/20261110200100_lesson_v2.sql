-- =============================================
-- 오늘의 학습 2단계
--  1. 레벨 테스트: 결과로 시작 레벨을 정하고, 맞힌 단어는 "아는 단어"로 표시 (새 단어로 다시 내지 않음)
--  2. 정답률·복습량에 따른 자동 조절: 새 단어 수를 늘리거나 줄이고, 이유를 세트에 남김(note)
--  3. 주제별 단어장: 사전의 주제(동물·음식…)로 아이가 직접 공부할 세트를 만든다 (source = 'theme')
-- 이전 코드와 호환: 새 컬럼·함수만 추가하고 ensure_daily_lesson의 호출 방식은 그대로
-- =============================================

BEGIN;

-- ---------- 1. 자녀: 레벨 테스트 결과 ----------
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS start_level smallint CHECK (start_level BETWEEN 1 AND 5),  -- NULL이면 학년으로 정함
  ADD COLUMN IF NOT EXISTS placement_done_at timestamptz;

-- 부모가 레벨 테스트를 다시 하게 하거나(초기화), 학년을 바꿀 때 결과를 지울 수 있게
GRANT UPDATE (start_level, placement_done_at) ON public.children TO authenticated;

-- ---------- 2. 단어 세트: 주제별 단어장, 자동 조절 메모 ----------
ALTER TABLE public.word_sets DROP CONSTRAINT IF EXISTS word_sets_source_check;
ALTER TABLE public.word_sets
  ADD CONSTRAINT word_sets_source_check CHECK (source IN ('parent', 'auto', 'theme'));
ALTER TABLE public.word_sets ADD COLUMN IF NOT EXISTS note text;

CREATE UNIQUE INDEX IF NOT EXISTS word_sets_one_theme_per_day
  ON public.word_sets (child_id, date, title) WHERE source = 'theme';

-- ---------- 3. 오늘의 학습: 시작 레벨 + 자동 조절 ----------
-- 새 단어 수 조절 (숙제 없는 날)
--   오늘 복습할 단어가 20개 넘음      → 새 단어 -3 (최소 2), 복습은 15개까지
--   최근 7일 정답률 60% 미만(20문제 이상) → 새 단어 -2 (최소 2)
--   최근 7일 정답률 90% 이상, 밀린 복습 5개 이하 → 새 단어 +2 (최대 10)
CREATE OR REPLACE FUNCTION public.ensure_daily_lesson(
  p_child uuid,
  p_day date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c            public.children%ROWTYPE;
  v_set        uuid;
  v_start      int;
  v_homework   boolean;
  v_due        int;
  v_review_cap int := 10;
  v_reviews    int;
  v_new        int;
  v_count      int;
  v_total      int;
  v_correct    int;
  v_acc        numeric;
  v_note       text;
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

  -- 레벨 테스트 결과가 있으면 그것, 없으면 학년 → 레벨 (영어 처음·초1·초2 → 1, 초3 → 2, … 초6 → 5)
  v_start := COALESCE(c.start_level, CASE WHEN c.grade <= 2 THEN 1 ELSE LEAST(c.grade - 1, 5) END);
  v_homework := EXISTS (
    SELECT 1 FROM public.word_sets
    WHERE child_id = p_child AND date = p_day AND source = 'parent'
  );

  SELECT count(*) INTO v_due FROM public.child_word_progress
  WHERE child_id = p_child AND next_review_date <= p_day;

  -- 최근 7일(오늘 제외) 정답률. 플래시카드는 정답 판정이 아니라 제외
  SELECT count(*), count(*) FILTER (WHERE is_correct) INTO v_total, v_correct
  FROM public.learning_records
  WHERE student_id = p_child
    AND module_type <> 'flashcard'
    AND created_at >= ((p_day - 7)::timestamp AT TIME ZONE 'Asia/Seoul')
    AND created_at < (p_day::timestamp AT TIME ZONE 'Asia/Seoul');
  v_acc := CASE WHEN v_total > 0 THEN v_correct::numeric / v_total END;

  v_new := c.daily_new_words;
  IF v_due > 20 THEN
    v_review_cap := 15;
    v_new := GREATEST(2, c.daily_new_words - 3);
    v_note := '복습할 단어가 많아서 새 단어를 줄였어요';
  ELSIF v_total >= 20 AND v_acc < 0.6 THEN
    v_new := GREATEST(2, c.daily_new_words - 2);
    v_note := '최근 정답률이 낮아서 새 단어를 줄였어요';
  ELSIF v_total >= 20 AND v_acc >= 0.9 AND v_due <= 5 THEN
    v_new := LEAST(10, c.daily_new_words + 2);
    v_note := '최근 정답률이 높아서 새 단어를 늘렸어요';
  END IF;

  v_reviews := LEAST(v_due, v_review_cap);
  IF v_homework THEN
    IF v_reviews < 4 THEN
      RETURN NULL;  -- 숙제 있는 날은 복습이 충분할 때만
    END IF;
    v_new := 0;
    v_note := '숙제가 있는 날이라 복습만 해요';
  END IF;
  v_new := GREATEST(v_new, 4 - v_reviews);

  INSERT INTO public.word_sets (title, date, parent_id, child_id, source, note)
  VALUES ('오늘의 학습', p_day, auth.uid(), p_child, 'auto', v_note)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_set;

  IF v_set IS NULL THEN
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
      LIMIT v_review_cap
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
        AND NOT EXISTS (
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
    DELETE FROM public.word_sets WHERE id = v_set;
    RETURN NULL;
  END IF;
  RETURN v_set;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_daily_lesson(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_daily_lesson(uuid, date) TO authenticated;

-- ---------- 4. 레벨 테스트 결과 반영 ----------
-- p_results: [{"english": "cat", "correct": true}, ...]
-- 레벨 1부터 차례로 정답률 75% 이상이면 통과, 처음 통과하지 못한 레벨이 시작 레벨 (다 통과하면 5)
-- 맞힌 단어는 아는 단어로 표시하고 4일 뒤 복습. 아직 공부하지 않은 오늘의 학습은 새 레벨로 다시 만들게 지운다
CREATE OR REPLACE FUNCTION public.apply_placement_result(
  p_child uuid,
  p_results jsonb,
  p_day date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lv       record;
  v_levels jsonb := '[]'::jsonb;
  v_start  int := 1;
  v_known  int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.children WHERE id = p_child AND family_id = public.my_family_id()
  ) THEN
    RAISE EXCEPTION 'child not found';
  END IF;

  FOR lv IN
    SELECT d.level,
           count(*)::int AS total,
           count(*) FILTER (WHERE (r->>'correct')::boolean)::int AS correct
    FROM jsonb_array_elements(p_results) AS r
    JOIN public.dictionary_words d ON d.english = lower(btrim(r->>'english'))
    GROUP BY d.level
    ORDER BY d.level
  LOOP
    v_levels := v_levels || jsonb_build_object('level', lv.level, 'total', lv.total, 'correct', lv.correct);
    IF lv.level = v_start AND lv.correct >= ceil(lv.total * 0.75) THEN
      v_start := LEAST(lv.level + 1, 5);
    END IF;
  END LOOP;

  INSERT INTO public.child_word_progress (
    child_id, english, korean, dictionary_word_id, first_seen,
    correct_count, streak, interval_days, next_review_date, last_step_date
  )
  SELECT DISTINCT ON (d.english)
         p_child, d.english, d.korean, d.id, p_day, 1, 2, 4, p_day + 4, p_day
  FROM jsonb_array_elements(p_results) AS r
  JOIN public.dictionary_words d ON d.english = lower(btrim(r->>'english'))
  WHERE (r->>'correct')::boolean
  ON CONFLICT (child_id, english) DO NOTHING;
  GET DIAGNOSTICS v_known = ROW_COUNT;

  UPDATE public.children SET start_level = v_start, placement_done_at = now() WHERE id = p_child;

  DELETE FROM public.word_sets s
  WHERE s.child_id = p_child AND s.date = p_day AND s.source = 'auto'
    AND NOT EXISTS (
      SELECT 1 FROM public.learning_records lr
      JOIN public.words w ON w.id = lr.word_id
      WHERE w.word_set_id = s.id
    );

  RETURN jsonb_build_object('start_level', v_start, 'known_words', v_known, 'levels', v_levels);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_placement_result(uuid, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_placement_result(uuid, jsonb, date) TO authenticated;

-- ---------- 5. 주제별 단어장 ----------
-- 아직 안 배운 단어 먼저(쉬운 레벨부터), 그다음 덜 익힌 단어 순으로 최대 10개. 같은 날 같은 주제는 같은 세트
CREATE OR REPLACE FUNCTION public.create_theme_lesson(
  p_child uuid,
  p_theme text,
  p_day date DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_set   uuid;
  v_title text := p_theme || ' 단어장';
  v_count int;
BEGIN
  PERFORM 1 FROM public.children WHERE id = p_child;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'child not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dictionary_words WHERE theme = p_theme) THEN
    RAISE EXCEPTION 'unknown theme';
  END IF;

  SELECT id INTO v_set FROM public.word_sets
  WHERE child_id = p_child AND date = p_day AND source = 'theme' AND title = v_title;
  IF FOUND THEN
    RETURN v_set;
  END IF;

  INSERT INTO public.word_sets (title, date, parent_id, child_id, source)
  VALUES (v_title, p_day, auth.uid(), p_child, 'theme')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_set;
  IF v_set IS NULL THEN
    SELECT id INTO v_set FROM public.word_sets
    WHERE child_id = p_child AND date = p_day AND source = 'theme' AND title = v_title;
    RETURN v_set;
  END IF;

  INSERT INTO public.words (word_set_id, english, korean, dictionary_word_id, lesson_role)
  SELECT v_set, d.english, d.korean, d.id,
         CASE WHEN p.english IS NULL THEN 'new' ELSE 'review' END
  FROM public.dictionary_words d
  LEFT JOIN public.child_word_progress p ON p.child_id = p_child AND p.english = d.english
  WHERE d.theme = p_theme
  ORDER BY (p.english IS NOT NULL), COALESCE(p.streak, 0), d.level, d.sort_order
  LIMIT 10;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count < 4 THEN
    DELETE FROM public.word_sets WHERE id = v_set;
    RETURN NULL;
  END IF;
  RETURN v_set;
END;
$$;

REVOKE ALL ON FUNCTION public.create_theme_lesson(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_theme_lesson(uuid, text, date) TO authenticated;

COMMIT;
