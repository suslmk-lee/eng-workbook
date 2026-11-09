-- Supabase SQL Editor에서 실행할 스키마

-- 단어 세트 (날짜별 숙제)
CREATE TABLE word_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 개별 단어
CREATE TABLE words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_set_id UUID REFERENCES word_sets(id) ON DELETE CASCADE,
  english TEXT NOT NULL,
  korean TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 학습 기록
CREATE TABLE learning_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id UUID REFERENCES words(id) ON DELETE CASCADE,
  module_type TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 복습 스케줄 (에빙하우스 망각곡선)
CREATE TABLE review_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  word_id UUID REFERENCES words(id) ON DELETE CASCADE,
  word_set_id UUID REFERENCES word_sets(id) ON DELETE CASCADE,
  next_review_date DATE NOT NULL,
  review_count INTEGER DEFAULT 0,
  ease_factor FLOAT DEFAULT 2.5
);

-- 보상
CREATE TABLE rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'star',
  description TEXT NOT NULL DEFAULT '',
  module_type TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_words_set ON words(word_set_id);
CREATE INDEX idx_records_word ON learning_records(word_id);
CREATE INDEX idx_records_module ON learning_records(module_type);
CREATE INDEX idx_review_date ON review_schedules(next_review_date);
CREATE INDEX idx_word_sets_date ON word_sets(date);

-- RLS 비활성화 (개인용 앱이므로)
ALTER TABLE word_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 public 접근 허용 (개인용)
CREATE POLICY "Allow all" ON word_sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON words FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON learning_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON review_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rewards FOR ALL USING (true) WITH CHECK (true);
