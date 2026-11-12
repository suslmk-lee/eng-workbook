-- =============================================
-- 학습 지속 장치 2차: 배지, 부모와 한 보상 약속, 외운 단어 수
-- Supabase SQL Editor에서 파일 전체를 한 번에 실행하세요.
-- 하나의 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않고, 여러 번 실행해도 결과가 같습니다.
-- 먼저 20261112100000_dictionary_v3.sql까지 적용되어 있어야 합니다.
--
--  1. 배지: 조건(연속 학습·도장·외운 단어·만점·레벨 테스트·문장)을 채우면 받는다.
--     get_rewards_status()를 부를 때 DB가 조건을 확인해 새 배지를 기록하고(earned_at),
--     아이가 축하 화면을 보면 mark_badges_seen()으로 "봤음" 표시 (부모가 봐도 아이 축하는 그대로 남음)
--  2. 보상 약속: 부모가 "도장 N개 모으면 ○○"을 정한다. 약속을 정한 날부터 찍은 도장 수로 진행을 센다.
--     아이당 진행 중인 약속은 하나. 부모가 "지켰어요"(fulfilled_at) 또는 취소(canceled_at)로 끝낸다
--  3. 외운 단어 = 서로 다른 날 3번 연속으로 맞힌 단어 (부모 화면의 "익힌 단어"와 같은 기준)
-- 날짜 기준: 한국 시간(Asia/Seoul)
-- =============================================

BEGIN;

-- ---------- 1. 배지 ----------
CREATE TABLE IF NOT EXISTS public.child_badges (
  child_id  uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  badge     text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  seen_at   timestamptz,               -- 아이가 축하 화면을 본 시각
  PRIMARY KEY (child_id, badge)
);

ALTER TABLE public.child_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS child_badges_select ON public.child_badges;
CREATE POLICY child_badges_select ON public.child_badges FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
REVOKE INSERT, UPDATE, DELETE ON public.child_badges FROM anon, authenticated;

-- 배지 목록: 순서, 이름(키), 기준 지표, 기준값. 화면의 그림·이름은 src/lib/badges.ts
CREATE OR REPLACE FUNCTION public.badge_catalog()
RETURNS TABLE (ord int, badge text, metric text, threshold int)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    (1,  'first_day',   'studied_days',     1),
    (2,  'first_stamp', 'met_days',         1),
    (3,  'streak_3',    'best_streak',      3),
    (4,  'streak_7',    'best_streak',      7),
    (5,  'streak_14',   'best_streak',      14),
    (6,  'streak_30',   'best_streak',      30),
    (7,  'streak_100',  'best_streak',      100),
    (8,  'stamps_10',   'met_days',         10),
    (9,  'stamps_30',   'met_days',         30),
    (10, 'stamps_100',  'met_days',         100),
    (11, 'words_10',    'mastered_words',   10),
    (12, 'words_50',    'mastered_words',   50),
    (13, 'words_100',   'mastered_words',   100),
    (14, 'words_300',   'mastered_words',   300),
    (15, 'words_500',   'mastered_words',   500),
    (16, 'words_1000',  'mastered_words',   1000),
    (17, 'perfect_10',  'trophies',         10),
    (18, 'perfect_50',  'trophies',         50),
    (19, 'placement',   'placement',        1),
    (20, 'sentence_50', 'sentence_correct', 50)
  ) AS t(ord, badge, metric, threshold)
$$;

-- 배지 기준이 되는 지표
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
                           AND lr.module_type IN ('cloze', 'ordering', 'shadowing'))
  )
$$;

-- ---------- 2. 보상 약속 ----------
CREATE TABLE IF NOT EXISTS public.child_promises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  reward       text NOT NULL CHECK (char_length(btrim(reward)) BETWEEN 1 AND 40),
  target       int  NOT NULL CHECK (target BETWEEN 3 AND 100),  -- 모을 도장 수
  start_day    date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,  -- 부모가 "지켰어요"
  canceled_at  timestamptz
);

-- 아이당 진행 중인 약속은 하나
CREATE UNIQUE INDEX IF NOT EXISTS child_promises_one_active
  ON public.child_promises (child_id) WHERE fulfilled_at IS NULL AND canceled_at IS NULL;

ALTER TABLE public.child_promises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS child_promises_select ON public.child_promises;
DROP POLICY IF EXISTS child_promises_insert ON public.child_promises;
DROP POLICY IF EXISTS child_promises_update ON public.child_promises;
CREATE POLICY child_promises_select ON public.child_promises FOR SELECT
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY child_promises_insert ON public.child_promises FOR INSERT
  WITH CHECK (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
CREATE POLICY child_promises_update ON public.child_promises FOR UPDATE
  USING (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()))
  WITH CHECK (child_id IN (SELECT c.id FROM public.children c WHERE c.family_id = public.my_family_id()));
-- 클라이언트는 약속 내용·목표 수와 끝내기만 (시작일·만든 사람은 DB가 채움)
REVOKE INSERT, UPDATE, DELETE ON public.child_promises FROM anon, authenticated;
GRANT INSERT (child_id, reward, target) ON public.child_promises TO authenticated;
GRANT UPDATE (reward, target, fulfilled_at, canceled_at) ON public.child_promises TO authenticated;

-- ---------- 3. 화면용: 지표 + 배지(새로 받은 것 기록) + 진행 중인 약속 ----------
CREATE OR REPLACE FUNCTION public.get_rewards_status(p_child uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_metrics jsonb;
  v_badges  jsonb;
  v_promise jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = p_child AND family_id = public.my_family_id()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_metrics := public.child_reward_metrics(p_child, v_today);

  INSERT INTO public.child_badges (child_id, badge)
  SELECT p_child, b.badge
  FROM public.badge_catalog() b
  WHERE COALESCE((v_metrics->>b.metric)::int, 0) >= b.threshold
  ON CONFLICT (child_id, badge) DO NOTHING;

  SELECT jsonb_agg(jsonb_build_object(
           'badge', b.badge, 'metric', b.metric, 'threshold', b.threshold,
           'earned_at', cb.earned_at, 'seen', cb.seen_at IS NOT NULL
         ) ORDER BY b.ord)
  INTO v_badges
  FROM public.badge_catalog() b
  LEFT JOIN public.child_badges cb ON cb.child_id = p_child AND cb.badge = b.badge;

  SELECT jsonb_build_object(
           'id', p.id, 'reward', p.reward, 'target', p.target, 'start_day', p.start_day,
           'progress', (SELECT count(*) FROM public.child_daily_goals g
                        WHERE g.child_id = p_child AND g.met_at IS NOT NULL AND g.day >= p.start_day)
         )
  INTO v_promise
  FROM public.child_promises p
  WHERE p.child_id = p_child AND p.fulfilled_at IS NULL AND p.canceled_at IS NULL;

  RETURN jsonb_build_object('metrics', v_metrics, 'badges', v_badges, 'promise', v_promise);
END;
$$;

-- 아이가 새 배지 축하 화면을 봤음
CREATE OR REPLACE FUNCTION public.mark_badges_seen(p_child uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.children WHERE id = p_child AND family_id = public.my_family_id()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.child_badges SET seen_at = now() WHERE child_id = p_child AND seen_at IS NULL;
END;
$$;

-- ---------- 4. 실행 권한 ----------
REVOKE ALL ON FUNCTION public.child_reward_metrics(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_rewards_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_badges_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rewards_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_badges_seen(uuid) TO authenticated;

COMMIT;

-- =============================================
-- 실행 후 확인 (결과 1행)
--   SELECT
--     to_regclass('public.child_badges') IS NOT NULL AND to_regclass('public.child_promises') IS NOT NULL AS tables,  -- true
--     (SELECT count(*) FROM public.badge_catalog()) AS badges,                                                    -- 20
--     (SELECT count(*) FROM pg_proc WHERE proname IN
--        ('badge_catalog', 'child_reward_metrics', 'get_rewards_status', 'mark_badges_seen')) AS functions;      -- 4
-- =============================================
