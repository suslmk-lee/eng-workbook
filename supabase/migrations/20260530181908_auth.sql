-- =============================================
-- 인증 시스템 마이그레이션 SQL
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. 프로필 테이블 (auth.users와 연동)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('parent', 'student')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 학부모-자녀 연결 테이블
CREATE TABLE parent_child (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  child_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, child_id)
);

-- 3. 기존 테이블에 user_id(소유자) 컬럼 추가
-- word_sets: parent_id (학부모가 등록), child_id (어떤 자녀 것인지)
ALTER TABLE word_sets ADD COLUMN parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE word_sets ADD COLUMN child_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- learning_records: student_id (어떤 학생이 학습했는지)
ALTER TABLE learning_records ADD COLUMN student_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- review_schedules: student_id
ALTER TABLE review_schedules ADD COLUMN student_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- rewards: student_id
ALTER TABLE rewards ADD COLUMN student_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. 인덱스 추가
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child ON parent_child(child_id);
CREATE INDEX idx_word_sets_parent ON word_sets(parent_id);
CREATE INDEX idx_word_sets_child ON word_sets(child_id);
CREATE INDEX idx_learning_records_student ON learning_records(student_id);
CREATE INDEX idx_rewards_student ON rewards(student_id);

-- 5. RLS 정책 업데이트
-- 기존 정책 제거
DROP POLICY IF EXISTS "Allow all" ON word_sets;
DROP POLICY IF EXISTS "Allow all" ON words;
DROP POLICY IF EXISTS "Allow all" ON learning_records;
DROP POLICY IF EXISTS "Allow all" ON review_schedules;
DROP POLICY IF EXISTS "Allow all" ON rewards;

-- profiles: 본인만 조회, 인증된 사용자만 삽입
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- parent_child: 학부모 또는 자녀만 조회
ALTER TABLE parent_child ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parent or child can view" ON parent_child FOR SELECT
  USING (auth.uid() = parent_id OR auth.uid() = child_id);
CREATE POLICY "Parent can insert" ON parent_child FOR INSERT
  WITH CHECK (auth.uid() = parent_id);
CREATE POLICY "Parent can delete" ON parent_child FOR DELETE
  USING (auth.uid() = parent_id);

-- word_sets: 학부모(본인 등록분) 또는 배정된 자녀가 조회
CREATE POLICY "Parent sees own sets" ON word_sets FOR SELECT
  USING (auth.uid() = parent_id OR auth.uid() = child_id);
CREATE POLICY "Parent can insert" ON word_sets FOR INSERT
  WITH CHECK (auth.uid() = parent_id);
CREATE POLICY "Parent can delete" ON word_sets FOR DELETE
  USING (auth.uid() = parent_id);

-- words: word_set 기반 접근
CREATE POLICY "Access via word_set" ON words FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM word_sets ws
    WHERE ws.id = words.word_set_id
    AND (ws.parent_id = auth.uid() OR ws.child_id = auth.uid())
  ));
CREATE POLICY "Insert via word_set" ON words FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM word_sets ws
    WHERE ws.id = words.word_set_id
    AND ws.parent_id = auth.uid()
  ));

-- learning_records: 본인 것만
CREATE POLICY "Student sees own records" ON learning_records FOR SELECT
  USING (student_id = auth.uid() OR EXISTS (
    SELECT 1 FROM parent_child pc WHERE pc.parent_id = auth.uid() AND pc.child_id = learning_records.student_id
  ));
CREATE POLICY "Student can insert" ON learning_records FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- review_schedules: 본인 것만
CREATE POLICY "Student sees own schedules" ON review_schedules FOR SELECT
  USING (student_id = auth.uid());
CREATE POLICY "Insert own schedules" ON review_schedules FOR INSERT
  WITH CHECK (student_id = auth.uid() OR EXISTS (
    SELECT 1 FROM word_sets ws WHERE ws.id = review_schedules.word_set_id AND ws.parent_id = auth.uid()
  ));
CREATE POLICY "Update own schedules" ON review_schedules FOR UPDATE
  USING (student_id = auth.uid());

-- rewards: 본인 것만
CREATE POLICY "Student sees own rewards" ON rewards FOR SELECT
  USING (student_id = auth.uid() OR EXISTS (
    SELECT 1 FROM parent_child pc WHERE pc.parent_id = auth.uid() AND pc.child_id = rewards.student_id
  ));
CREATE POLICY "Student can insert" ON rewards FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- 6. 프로필 자동 생성 함수 (회원가입 시)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거: 새 사용자 생성 시 프로필 자동 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
