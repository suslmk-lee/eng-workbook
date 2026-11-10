-- =============================================
-- 로컬 개발용 테스트 데이터 — npm run db:reset 할 때 자동으로 들어갑니다.
-- 운영 DB에서는 절대 실행하지 마세요.
--
-- 학부모 계정 (비밀번호 모두 pass1234)
--   엄마  mom@test.local  가족 owner
--   아빠  dad@test.local  같은 가족 guardian
-- 자녀 프로필
--   민아  초3. 숙제 2개(어제·오늘), 최근 2주 학습 기록, 보상
--   준    영어 처음. 숙제 1개(오늘), 기록 없음
-- 부모 PIN은 비워 둡니다 (아이를 처음 고를 때 PIN을 정하는 흐름을 확인할 수 있게)
-- =============================================

-- 1. 학부모 계정. auth.users에 넣으면 handle_new_user 트리거가 프로필과 가족을 만든다.
--    토큰 칸을 NULL로 두면 로그인 시 오류가 나므로 빈 문자열로 채운다.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('pass1234', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object('name', u.name, 'role', 'parent', 'terms_version', '2026-11-11'),  -- 약관 동의 (src/lib/legal.ts의 TERMS_VERSION과 같게)
  now(), now(), '', '', '', ''
FROM (VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'mom@test.local', '엄마'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'dad@test.local', '아빠')
) AS u(id, email, name);

INSERT INTO auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
FROM auth.users
WHERE email IN ('mom@test.local', 'dad@test.local');

-- 2. 아빠를 엄마 가족으로 (가입 트리거가 만든 아빠 혼자 가족은 삭제)
DELETE FROM public.families f
USING public.family_members m
WHERE m.family_id = f.id AND m.user_id = 'a0000000-0000-0000-0000-000000000002';

INSERT INTO public.family_members (family_id, user_id, role)
SELECT family_id, 'a0000000-0000-0000-0000-000000000002', 'guardian'
FROM public.family_members
WHERE user_id = 'a0000000-0000-0000-0000-000000000001';

-- 3. 자녀 프로필
INSERT INTO public.children (id, family_id, name, grade)
SELECT c.id, m.family_id, c.name, c.grade
FROM public.family_members m
CROSS JOIN (VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, '민아', 3),
  ('c0000000-0000-0000-0000-000000000002'::uuid, '준', 0)
) AS c(id, name, grade)
WHERE m.user_id = 'a0000000-0000-0000-0000-000000000001';

-- 4. 단어 세트
INSERT INTO public.word_sets (id, title, date, parent_id, child_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Unit 3 과일', (now() AT TIME ZONE 'Asia/Seoul')::date - 1, 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'Unit 4 동물', (now() AT TIME ZONE 'Asia/Seoul')::date,     'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000003', 'Unit 1 색깔', (now() AT TIME ZONE 'Asia/Seoul')::date,     'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002');

INSERT INTO public.words (word_set_id, english, korean)
SELECT s.set_id::uuid, w.english, w.korean
FROM (VALUES
  ('50000000-0000-0000-0000-000000000001', 'apple,사과|banana,바나나|cherry,체리|grape,포도|lemon,레몬|melon,멜론|orange,오렌지|peach,복숭아|pear,배|strawberry,딸기'),
  ('50000000-0000-0000-0000-000000000002', 'cat,고양이|dog,개|bird,새|fish,물고기|horse,말|rabbit,토끼|tiger,호랑이|lion,사자|bear,곰|monkey,원숭이'),
  ('50000000-0000-0000-0000-000000000003', 'red,빨간색|blue,파란색|yellow,노란색|green,초록색|pink,분홍색|black,검은색|white,흰색|brown,갈색|purple,보라색|gray,회색')
) AS s(set_id, list)
CROSS JOIN LATERAL (
  SELECT split_part(pair, ',', 1) AS english, split_part(pair, ',', 2) AS korean
  FROM unnest(string_to_array(s.list, '|')) AS pair
) AS w;

-- 5. 민아의 최근 2주 학습 기록 (며칠은 쉼). 퀴즈·매칭은 한 번에 저장(같은 시각), 스펠링은 문제마다 저장
WITH days AS (
  SELECT d FROM generate_series(1, 14) AS d WHERE d NOT IN (4, 9, 10)
),
w AS (
  SELECT id, row_number() OVER (ORDER BY english) AS n
  FROM public.words WHERE word_set_id = '50000000-0000-0000-0000-000000000001'
)
INSERT INTO public.learning_records (word_id, module_type, is_correct, student_id, created_at)
SELECT
  w.id,
  m.module,
  abs(hashtext(w.id::text || days.d || m.module)) % 10 < 8,  -- 정답률 약 80%
  'c0000000-0000-0000-0000-000000000001',
  (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') - days.d * interval '1 day' + interval '18 hours'
    + m.start_min * interval '1 minute'
    + CASE WHEN m.batch THEN interval '0' ELSE w.n * interval '20 seconds' END
FROM days
CROSS JOIN w
CROSS JOIN (VALUES ('quiz', true, 0), ('matching', true, 5), ('spelling', false, 10)) AS m(module, batch, start_min);

INSERT INTO public.rewards (type, description, module_type, student_id, earned_at)
SELECT 'star', '4지선다 퀴즈 80% 이상! ⭐', 'quiz', 'c0000000-0000-0000-0000-000000000001',
       (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') - d * interval '1 day' + interval '18 hours 3 minutes'
FROM generate_series(1, 14, 3) AS d;

-- 아이별 단어 학습 상태(child_word_progress)는 위 학습 기록이 들어갈 때 트리거가 자동으로 만든다.
-- 오늘의 학습은 아이가 앱을 열 때 만들어진다 (민아·준 모두 오늘 숙제가 있어 복습 위주).
