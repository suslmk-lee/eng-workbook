export type UserRole = "parent" | "student";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface ParentChild {
  id: string;
  parent_id: string;
  child_id: string;
  created_at: string;
  child?: Profile;
  parent?: Profile;
}

export interface Word {
  id: string;
  word_set_id: string;
  english: string;
  korean: string;
  created_at: string;
}

export interface WordSet {
  id: string;
  title: string;
  date: string;
  parent_id?: string;
  child_id?: string;
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
  | "exam";

export interface ModuleInfo {
  type: ModuleType;
  title: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
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
];
