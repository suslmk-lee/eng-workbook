export type UserRole = "parent" | "student";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  terms_version?: string | null;    // 동의한 약관 버전 (src/lib/legal.ts TERMS_VERSION)
  terms_agreed_at?: string | null;
}

// 자녀 프로필: 로그인 계정이 아니라 가족(families)에 속한 프로필.
// 부모가 로그인한 기기에서 프로필을 골라 "자녀 모드"로 학습한다.
export interface Child {
  id: string;
  family_id: string;
  name: string;
  grade: number;            // 0: 영어 처음, 1~6: 초1~초6 (오늘의 학습 시작 수준)
  daily_new_words: number;  // 오늘의 학습 새 단어 수 (3~10)
  auto_lesson: boolean;     // 오늘의 학습 자동 구성
  start_level: number | null;        // 레벨 테스트 결과(1~5). 있으면 학년 대신 이 레벨부터
  placement_done_at: string | null;  // 레벨 테스트 본 시각
  guardian_consent_at?: string | null; // 보호자(법정대리인)가 자녀 정보 처리에 동의한 시각
  created_at: string;
}

// 사전 레벨 → 화면 표시
export const LEVEL_LABELS: Record<number, string> = {
  1: "레벨 1 (영어 처음~초2)",
  2: "레벨 2 (초3)",
  3: "레벨 3 (초4)",
  4: "레벨 4 (초5)",
  5: "레벨 5 (초6)",
  6: "레벨 6 (중1)",
  7: "레벨 7 (중2)",
};

export interface DictionaryWord {
  id: number;
  english: string;
  korean: string;
  level: number;
  theme: string;
  sort_order: number;
}

// 주제별 단어장 아이콘
export const THEME_EMOJI: Record<string, string> = {
  숫자: "🔢", 색깔: "🎨", 동물: "🐶", 가족: "👪", 몸: "🖐️", 음식: "🍎", 물건: "🎒", 인사: "👋",
  학교: "🏫", 동작: "🏃", "모양·상태": "📏", 날씨: "⛅", "집·자연": "🏡",
  시간: "⏰", 장소: "🗺️", 생활: "🧹", 상태: "😴", 옷: "👕",
  직업: "👩‍⚕️", 교통: "🚌", "취미·운동": "⚽", 감정: "😊", "생각·배움": "💡", "성격·상태": "🙂", "말·글": "✉️",
  "자연·환경": "🌍", 건강: "💪", 행동: "✋", "느낌·평가": "⭐", "생각·문화": "🎎", 여행: "✈️",
  "사회·세계": "🏛️", "과학·기술": "🔬", 의사소통: "💬", "경제·일": "💼",
};

export const GRADE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "영어 처음" },
  { value: 1, label: "초1" },
  { value: 2, label: "초2" },
  { value: 3, label: "초3" },
  { value: 4, label: "초4" },
  { value: 5, label: "초5" },
  { value: 6, label: "초6" },
];

export const DAILY_NEW_WORD_OPTIONS = [3, 5, 7, 10];

export function gradeLabel(grade: number): string {
  return GRADE_OPTIONS.find((g) => g.value === grade)?.label ?? `${grade}학년`;
}

export interface Word {
  id: string;
  word_set_id: string;
  english: string;
  korean: string;
  created_at: string;
  dictionary_word_id?: number | null;
  lesson_role?: "new" | "review" | null;  // 오늘의 학습에서 새 단어/복습 구분
  dictionary_words?: { example_en: string; example_ko: string } | null;  // 사전 예문
}

export interface WordSet {
  id: string;
  title: string;
  date: string;
  parent_id?: string;
  child_id?: string;
  source?: "parent" | "auto" | "theme";  // 부모가 넣은 숙제 / 자동 오늘의 학습 / 주제별 단어장
  note?: string | null;                  // 오늘의 학습 자동 조절 이유
  created_at: string;
  words?: Word[];
}

export interface LearningRecord {
  id: string;
  word_id: string;
  student_id?: string;
  module_type: ModuleType;
  is_correct: boolean;
  response_time_ms?: number;
  created_at: string;
}

export interface ReviewSchedule {
  id: string;
  word_id: string;
  word_set_id: string;
  student_id?: string;
  next_review_date: string;
  review_count: number;
  ease_factor: number;
}

export interface Reward {
  id: string;
  type: "star" | "trophy" | "medal" | "crown";
  description: string;
  student_id?: string;
  earned_at: string;
  module_type?: ModuleType;
}

export type ModuleType =
  | "flashcard"
  | "quiz"
  | "matching"
  | "spelling"
  | "scramble"
  | "listening"
  | "speed"
  | "speaking"
  | "battle"
  | "exam"
  | "cloze"       // 문장 빈칸 채우기
  | "ordering"    // 문장 순서 맞추기
  | "shadowing";  // 문장 따라 말하기

export interface ModuleInfo {
  type: ModuleType;
  title: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  group?: "sentence";  // 문장 학습 (사전 예문이 있는 단어로)
}

export interface LearningStats {
  totalWords: number;
  correctCount: number;
  incorrectCount: number;
  accuracy: number;
  streakDays: number;
}

export const MODULE_LIST: ModuleInfo[] = [
  {
    type: "flashcard",
    title: "플래시카드",
    description: "카드를 넘기며 단어를 외워요",
    icon: "Layers",
    color: "text-kid-blue",
    bgColor: "bg-blue-100",
  },
  {
    type: "quiz",
    title: "4지선다 퀴즈",
    description: "정답을 골라보세요",
    icon: "CircleHelp",
    color: "text-kid-purple",
    bgColor: "bg-purple-100",
  },
  {
    type: "matching",
    title: "매칭 게임",
    description: "짝을 맞춰보세요",
    icon: "Puzzle",
    color: "text-kid-green",
    bgColor: "bg-green-100",
  },
  {
    type: "spelling",
    title: "스펠링 입력",
    description: "단어를 직접 써보세요",
    icon: "PenLine",
    color: "text-kid-orange",
    bgColor: "bg-orange-100",
  },
  {
    type: "scramble",
    title: "단어 스크램블",
    description: "섞인 글자를 맞춰보세요",
    icon: "Shuffle",
    color: "text-kid-pink",
    bgColor: "bg-pink-100",
  },
  {
    type: "listening",
    title: "듣고 쓰기",
    description: "발음을 듣고 써보세요",
    icon: "Headphones",
    color: "text-kid-yellow",
    bgColor: "bg-yellow-100",
  },
  {
    type: "speed",
    title: "스피드 퀴즈",
    description: "시간 안에 맞춰보세요!",
    icon: "Zap",
    color: "text-kid-red",
    bgColor: "bg-red-100",
  },
  {
    type: "speaking",
    title: "발음 챌린지",
    description: "마이크에 대고 말해보세요",
    icon: "Mic",
    color: "text-indigo-500",
    bgColor: "bg-indigo-100",
  },
  {
    type: "battle",
    title: "몬스터 배틀",
    description: "정답으로 몬스터를 물리쳐요!",
    icon: "Swords",
    color: "text-rose-500",
    bgColor: "bg-rose-100",
  },
  {
    type: "cloze",
    title: "문장 빈칸 채우기",
    description: "문장에 알맞은 단어를 골라요",
    icon: "TextCursorInput",
    color: "text-teal-500",
    bgColor: "bg-teal-100",
    group: "sentence",
  },
  {
    type: "ordering",
    title: "문장 순서 맞추기",
    description: "단어를 순서대로 놓아 문장을 만들어요",
    icon: "ListOrdered",
    color: "text-amber-500",
    bgColor: "bg-amber-100",
    group: "sentence",
  },
  {
    type: "shadowing",
    title: "문장 따라 말하기",
    description: "문장을 듣고 따라 말해요",
    icon: "Speech",
    color: "text-sky-500",
    bgColor: "bg-sky-100",
    group: "sentence",
  },
];

// 모듈 이름 (통계 표시용)
export const MODULE_SHORT_NAMES: Record<ModuleType, string> = {
  flashcard: "플래시카드",
  quiz: "4지선다",
  matching: "매칭",
  spelling: "스펠링",
  scramble: "스크램블",
  listening: "듣기",
  speed: "스피드",
  speaking: "발음",
  battle: "배틀",
  exam: "시험",
  cloze: "문장 빈칸",
  ordering: "문장 순서",
  shadowing: "문장 말하기",
};
