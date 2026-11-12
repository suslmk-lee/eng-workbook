"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  BarChart3,
  Calendar,
  BookOpen,
  Trophy,
  Target,
  ChevronDown,
  ChevronUp,
  LogOut,
  UserPlus,
  Users,
  KeyRound,
  Award,
  TrendingUp,
  Camera,
  Pencil,
  Play,
  UserCog,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import CameraOcr, { CameraWord } from "@/components/CameraOcr";
import TermsGate, { needsConsent } from "@/components/TermsGate";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import LegalFooter from "@/components/LegalFooter";
import { ChildPrivacySummary } from "@/components/ConsentChecklist";
import TtsStatusBadge from "@/components/TtsStatusBadge";
import ParentPinDialog from "@/components/ParentPinDialog";
import LegacyStudentNotice from "@/components/LegacyStudentNotice";
import { WordSet, Child, GRADE_OPTIONS, DAILY_NEW_WORD_OPTIONS, LEVEL_LABELS, THEME_EMOJI, MODULE_SHORT_NAMES } from "@/lib/types";
import {
  createWordSet,
  getWordSetsByChild,
  deleteWordSet,
  getDashboardStats,
  getWordStats,
  getChildren,
  createChild,
  renameChild,
  deleteChild,
  updateChildSettings,
  getWordProgressSummary,
  getDictionary,
  getLearnedWords,
  WordProgressSummary,
  hasParentPin,
  getDailyStatsRange,
  DailyStats,
  getMyTermsVersion,
  changePassword,
  lookupMeanings,
  getGoalStatus,
  GoalStatus,
  getRewardsStatus,
  RewardsStatus,
  getAlphabetProgress,
} from "@/lib/api";
import { AlphabetSummary } from "@/components/AlphabetKit";
import type { LetterProgress } from "@/lib/alphabet";
import { BadgeSummary, PromiseEditor } from "@/components/Rewards";
import { StampCalendar, goalSummaryText } from "@/components/DailyGoal";
import { InstallAppCard, InstallAppSection } from "@/components/InstallAppGuide";
import { normalizeEnglish } from "@/lib/meaning";
import { formatDate, getTodayString, getAccuracyColor, parseLocalDate } from "@/lib/utils";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { isParentUnlocked, setParentUnlocked } from "@/lib/child-mode";

interface WordInput {
  english: string;
  korean: string;
  auto?: boolean; // 뜻을 자동으로 채움 (부모가 고치면 false)
}

// 뜻이 비어 있는 칸에 찾은 뜻을 넣는다
function withMeanings(list: WordInput[], meanings: Map<string, string>): WordInput[] {
  return list.map((w) => {
    if (w.korean.trim() || !w.english.trim()) return w;
    const k = meanings.get(normalizeEnglish(w.english));
    return k ? { ...w, korean: k, auto: true } : w;
  });
}

const emptyWords = (): WordInput[] =>
  Array.from({ length: 10 }, () => ({ english: "", korean: "" }));

export default function ParentPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState<"register" | "dashboard" | "children" | "account">("children");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getTodayString());
  const [words, setWords] = useState<WordInput[]>(emptyWords());
  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [wordStats, setWordStats] = useState<any[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState(3);
  const [progress, setProgress] = useState<WordProgressSummary | null>(null);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [heatmapDays, setHeatmapDays] = useState<30 | 60 | 90>(30);
  const [showCamera, setShowCamera] = useState(false);
  const [fillTheme, setFillTheme] = useState("");
  const [themeOptions, setThemeOptions] = useState<{ theme: string; level: number; count: number }[]>([]);
  const [gateChecked, setGateChecked] = useState(false); // 부모 PIN 잠금 확인 끝
  const [hasPin, setHasPin] = useState(false);
  const [pinDialog, setPinDialog] = useState<"setup" | "change" | null>(null);
  // 약관 동의: 동의한 버전 (null: 동의 기록 없음, undefined: 아직 모름/조회 실패)
  const [termsVersion, setTermsVersion] = useState<string | null | undefined>(undefined);
  const [childConsent, setChildConsent] = useState(false); // 자녀 추가 시 법정대리인 동의
  const [showChildConsentDetail, setShowChildConsentDetail] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  // 자녀별 오늘의 목표·연속 학습·이번 주 요약
  const [goals, setGoals] = useState<Record<string, GoalStatus | null>>({});
  // 자녀별 배지·보상 약속
  const [rewards, setRewards] = useState<Record<string, RewardsStatus | null>>({});
  const [alphabet, setAlphabet] = useState<Record<string, LetterProgress> | null>(null); // 고른 자녀의 알파벳
  // 뜻 자동 채우기
  const [lookingUp, setLookingUp] = useState<number[]>([]); // 뜻을 찾는 중인 줄
  const [meaningBusy, setMeaningBusy] = useState(false);
  const [meaningMsg, setMeaningMsg] = useState("");

  const userId = user?.id;
  const legacy = isLegacyStudent(user, profile);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { router.replace("/login"); return; }
    if (legacy) return;
    (async () => {
      // 부모 PIN이 있으면, 이 탭에서 PIN을 확인한 경우에만 들어올 수 있다 (자녀 모드 잠금)
      const pin = await hasParentPin();
      if (pin && !isParentUnlocked(userId)) {
        window.location.replace("/profiles");
        return;
      }
      setHasPin(pin);
      // 약관·자녀 동의 확인에 필요한 값을 먼저 읽고 화면을 연다
      const [terms] = await Promise.all([getMyTermsVersion(userId), loadChildren()]);
      setTermsVersion(terms);
      setGateChecked(true);
    })();
  }, [userId, legacy, authLoading]);

  useEffect(() => {
    if (selectedChildId) loadData();
  }, [selectedChildId, heatmapDays]);

  useEffect(() => {
    if (!gateChecked || children.length === 0) return;
    let cancelled = false;
    Promise.all(children.map(async (c) => [c.id, await getGoalStatus(c.id)] as const)).then((entries) => {
      if (!cancelled) setGoals(Object.fromEntries(entries));
    });
    loadRewards();
    return () => {
      cancelled = true;
    };
  }, [gateChecked, children]);

  // 배지·약속 다시 읽기 (약속을 정하거나 바꾼 뒤에도)
  async function loadRewards() {
    const entries = await Promise.all(children.map(async (c) => [c.id, await getRewardsStatus(c.id)] as const));
    setRewards(Object.fromEntries(entries));
  }

  // 단어 등록 탭: 단어장 주제 목록 (쉬운 주제부터)
  useEffect(() => {
    if (tab !== "register" || themeOptions.length > 0) return;
    getDictionary().then((dict) => {
      const byTheme = new Map<string, { theme: string; level: number; count: number }>();
      for (const w of dict) {
        const t = byTheme.get(w.theme) ?? { theme: w.theme, level: w.level, count: 0 };
        t.level = Math.min(t.level, w.level);
        t.count += 1;
        byTheme.set(w.theme, t);
      }
      setThemeOptions(
        Array.from(byTheme.values()).sort((a, b) => a.level - b.level || a.theme.localeCompare(b.theme))
      );
    });
  }, [tab]);

  async function loadChildren() {
    const result = await getChildren();
    setChildren(result);
    if (result.length === 0) {
      setSelectedChildId("");
    } else if (!result.some((c) => c.id === selectedChildId)) {
      setSelectedChildId(result[0].id);
    }
  }

  async function loadData() {
    if (!selectedChildId) return;
    const [sets, dashStats, daily, prog, alpha] = await Promise.all([
      getWordSetsByChild(selectedChildId),
      getDashboardStats(selectedChildId),
      getDailyStatsRange(selectedChildId, heatmapDays),
      getWordProgressSummary(selectedChildId),
      getAlphabetProgress(selectedChildId),
    ]);
    setAlphabet(alpha);
    setDailyStats(daily);
    setWordSets(sets);
    setStats(dashStats);
    setProgress(prog);
  }

  async function handleChildSetting(
    child: Child,
    settings: Partial<
      Pick<Child, "grade" | "daily_new_words" | "auto_lesson" | "start_level" | "placement_done_at">
    >
  ) {
    if (!(await updateChildSettings(child.id, settings))) {
      alert("설정을 저장하지 못했어요. 다시 시도해주세요.");
      return;
    }
    await loadChildren();
  }

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return;
    if (!childConsent) {
      setCreateError("자녀 개인정보 수집·이용에 동의해주세요.");
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    const { child, error } = await createChild(name, childGrade);
    if (error || !child) {
      setCreateError("자녀를 추가하지 못했어요. 이름은 1~30자로 입력해주세요.");
    } else {
      setChildName("");
      setChildConsent(false);
      await loadChildren();
      setSelectedChildId(child.id);
    }
    setCreateLoading(false);
  }

  async function handleRenameChild(child: Child) {
    const name = prompt("새 이름을 입력하세요", child.name);
    if (name === null || !name.trim() || name.trim() === child.name) return;
    if (!(await renameChild(child.id, name))) {
      alert("이름을 바꾸지 못했어요. 1~30자로 입력해주세요.");
      return;
    }
    await loadChildren();
  }

  async function handleDeleteChild(child: Child) {
    const typed = prompt(
      `${child.name}의 프로필을 삭제하면 단어 숙제·학습 기록·보상이 모두 지워지고 되돌릴 수 없어요.\n\n삭제하려면 아이 이름(${child.name})을 입력하세요.`
    );
    if (typed === null) return;
    if (typed.trim() !== child.name) {
      alert("이름이 일치하지 않아 삭제하지 않았어요.");
      return;
    }
    if (!(await deleteChild(child.id))) {
      alert("삭제하지 못했어요. 다시 시도해주세요.");
      return;
    }
    await loadChildren();
  }

  // 자녀 모드로: 프로필 선택 화면으로 (PIN이 없으면 자녀를 고를 때 PIN부터 정한다)
  function goChildMode() {
    if (userId) setParentUnlocked(userId, false);
    window.location.assign("/profiles");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedChildId) {
      alert("자녀를 먼저 선택해주세요.");
      return;
    }
    setLoading(true);
    let list = words;
    if (list.some((w) => w.english.trim() && !w.korean.trim())) {
      const { meanings } = await findMeanings(list);
      list = withMeanings(list, meanings);
      const stillMissing = list.filter((w) => w.english.trim() && !w.korean.trim()).map((w) => w.english.trim());
      if (stillMissing.length > 0) {
        setLoading(false);
        alert(`뜻을 찾지 못한 단어가 있어요: ${stillMissing.join(", ")}\n뜻을 직접 입력하거나 그 줄의 영어를 지워주세요.`);
        return;
      }
    }
    const validWords = list
      .filter((w) => w.english.trim() && w.korean.trim())
      .map((w) => ({ english: w.english.trim(), korean: w.korean.trim() }));
    if (validWords.length === 0) {
      setLoading(false);
      alert("최소 1개 이상의 단어를 입력해주세요.");
      return;
    }

    const result = await createWordSet(
      title || `${date} 숙제`,
      date,
      validWords,
      user.id,
      selectedChildId
    );
    if (result) {
      setTitle("");
      setDate(getTodayString());
      setWords(emptyWords());
      setMeaningMsg("");
      await loadData();
      alert(`${validWords.length}개 단어가 등록되었습니다!`);
    } else {
      alert("등록에 실패했습니다. 다시 시도해주세요.");
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("이 단어 세트를 삭제할까요?")) return;
    await deleteWordSet(id);
    await loadData();
  }

  function updateWord(index: number, field: "english" | "korean", value: string) {
    setWords((prev) =>
      prev.map((w, i) => {
        if (i !== index) return w;
        if (field === "korean") return { ...w, korean: value, auto: false };
        // 영어를 고치면 자동으로 넣은 뜻은 맞지 않으니 비운다 (칸을 벗어나면 다시 찾음)
        return { ...w, english: value, korean: w.auto ? "" : w.korean, auto: false };
      })
    );
  }

  // 영어만 있고 뜻이 빈 줄의 뜻 찾기 (사전 → AI). onlyIndex가 있으면 그 줄만
  async function findMeanings(list: WordInput[], onlyIndex?: number) {
    const targets = list
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => (onlyIndex === undefined || i === onlyIndex) && w.english.trim() && !w.korean.trim());
    if (targets.length === 0) return { meanings: new Map<string, string>(), targets, aiUnavailable: false };
    setLookingUp((prev) => [...prev, ...targets.map((t) => t.i)]);
    const { meanings, aiUnavailable } = await lookupMeanings(targets.map((t) => t.w.english));
    setLookingUp((prev) => prev.filter((i) => !targets.some((t) => t.i === i)));
    setWords((prev) => withMeanings(prev, meanings));
    return { meanings, targets, aiUnavailable };
  }

  function handleEnglishBlur(index: number) {
    const w = words[index];
    if (w?.english.trim() && !w.korean.trim()) void findMeanings(words, index);
  }

  async function handleAutoMeanings() {
    setMeaningMsg("");
    setMeaningBusy(true);
    const { meanings, targets, aiUnavailable } = await findMeanings(words);
    setMeaningBusy(false);
    if (targets.length === 0) {
      setMeaningMsg("뜻이 비어 있는 단어가 없어요.");
      return;
    }
    const missing = targets.filter((t) => !meanings.get(normalizeEnglish(t.w.english))).map((t) => t.w.english.trim());
    const filled = targets.length - missing.length;
    if (missing.length === 0) setMeaningMsg(`${filled}개 단어의 뜻을 채웠어요. 틀린 뜻은 고쳐주세요.`);
    else
      setMeaningMsg(
        `${filled}개를 채웠고, ${missing.join(", ")}의 뜻은 ${aiUnavailable ? "지금 찾을 수 없어요" : "찾지 못했어요"}. 직접 입력해주세요.`
      );
  }

  // 주제별 단어장에서 빈칸 채우기: 아이가 안 배운 단어 → 배운 단어 순, 폼에 이미 있는 단어는 제외
  async function handleFillFromTheme() {
    if (!fillTheme) return;
    const [dict, learned] = await Promise.all([
      getDictionary(),
      selectedChildId ? getLearnedWords(selectedChildId) : Promise.resolve(new Map<string, number>()),
    ]);
    const inForm = new Set(words.map((w) => w.english.trim().toLowerCase()).filter(Boolean));
    const candidates = dict.filter((w) => w.theme === fillTheme && !inForm.has(w.english));
    const ordered = [
      ...candidates.filter((w) => !learned.has(w.english)),
      ...candidates.filter((w) => learned.has(w.english)),
    ];
    const emptyRows = words
      .map((w, i) => (!w.english.trim() && !w.korean.trim() ? i : -1))
      .filter((i) => i >= 0);
    if (emptyRows.length === 0) {
      alert("빈칸이 없어요. 단어를 지우고 다시 눌러 주세요.");
      return;
    }
    if (ordered.length === 0) {
      alert("이 주제에서 더 넣을 단어가 없어요.");
      return;
    }
    const next = [...words];
    ordered.slice(0, emptyRows.length).forEach((w, k) => {
      next[emptyRows[k]] = { english: w.english, korean: w.korean };
    });
    setWords(next);
    if (!title.trim()) setTitle(`${fillTheme} 단어`);
  }

  // 카메라로 인식된 단어들을 폼에 채워넣기
  function handleWordsFromCamera(detectedWords: CameraWord[]) {
    setShowCamera(false);
    if (detectedWords.length === 0) return;

    // 기존 빈 슬롯에 단어 채우기
    const newWords = [...words];
    let filledCount = 0;

    for (let i = 0; i < newWords.length && filledCount < detectedWords.length; i++) {
      if (!newWords[i].english && !newWords[i].korean) {
        const d = detectedWords[filledCount];
        newWords[i] = { english: d.english, korean: d.korean, auto: d.auto };
        filledCount++;
      }
    }

    // 남은 단어가 있으면 추가 슬롯 생성
    for (const d of detectedWords.slice(filledCount)) {
      newWords.push({ english: d.english, korean: d.korean, auto: d.auto });
    }

    setWords(newWords);
    setMeaningMsg(`사진에서 ${detectedWords.length}개 단어를 넣었어요. 확인하고 등록해주세요.`);
  }

  async function toggleExpand(setId: string) {
    if (expandedSet === setId) {
      setExpandedSet(null);
      setWordStats([]);
      return;
    }
    setWordStats([]);
    setExpandedSet(setId);
    const stats = await getWordStats(setId);
    setWordStats(stats);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ ok: false, text: "비밀번호는 6자 이상이어야 해요." });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordMsg({ ok: false, text: "두 비밀번호가 서로 달라요." });
      return;
    }
    setPasswordSaving(true);
    const { error } = await changePassword(newPassword);
    setPasswordSaving(false);
    if (error) {
      setPasswordMsg({ ok: false, text: error });
    } else {
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordMsg({ ok: true, text: "비밀번호를 바꿨어요." });
    }
  }

  if (legacy) return <LegacyStudentNotice />;

  if (authLoading || !gateChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📚</div>
      </div>
    );
  }

  if (needsConsent(termsVersion, children)) {
    return (
      <TermsGate
        termsVersion={termsVersion ?? null}
        email={user?.email ?? profile?.email ?? ""}
        childList={children}
        onAgreed={async () => {
          await loadChildren();
          setTermsVersion(await getMyTermsVersion(userId!));
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">학부모 페이지</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500">{profile?.name}님 환영합니다</p>
              <TtsStatusBadge />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {children.length > 0 && (
              <button
                onClick={goChildMode}
                className="flex items-center gap-2 px-4 py-2 text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
              >
                <Play className="w-5 h-5" />
                <span className="text-sm font-bold">자녀 모드</span>
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">로그아웃</span>
            </button>
          </div>
        </div>

        {/* 홈 화면 앱 설치 안내 (설치할 수 있는 기기에서만) */}
        <InstallAppCard />

        {/* 오늘 한눈에: 자녀별 오늘의 목표·연속 학습·이번 주 */}
        {children.length > 0 && Object.keys(goals).length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-md mb-4" aria-label="오늘 한눈에">
            <p className="font-medium text-gray-700 mb-2">오늘 한눈에</p>
            <div className="space-y-2">
              {children.map((c) => {
                const g = goals[c.id] ?? null;
                const summary = goalSummaryText(g, c.auto_lesson);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-child={c.name}>
                    <span className="font-bold text-gray-800 w-16 truncate">{c.name}</span>
                    <span className="text-gray-700">
                      {summary.icon} {summary.text}
                    </span>
                    {g && (
                      <>
                        <span className="text-orange-600 font-medium">🔥 {g.streak}일 연속</span>
                        <span className="text-gray-500">
                          이번 주 {g.week.studied_days}일 학습 · 목표 {g.week.met_days}일 달성
                        </span>
                      </>
                    )}
                    {rewards[c.id]?.promise && (
                      <span className="text-pink-600">
                        🎁 약속 {Math.min(rewards[c.id]!.promise!.progress, rewards[c.id]!.promise!.target)}/{rewards[c.id]!.promise!.target}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Child Selector */}
        {children.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-md mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-primary-500" />
              <span className="font-medium text-gray-700">자녀 선택</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedChildId === c.id
                      ? "bg-primary-500 text-white shadow-md"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto">
          <button
            onClick={() => setTab("children")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
              tab === "children"
                ? "bg-primary-500 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <UserPlus className="w-5 h-5" />
            자녀 관리
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
              tab === "register"
                ? "bg-primary-500 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Plus className="w-5 h-5" />
            단어 등록
          </button>
          <button
            onClick={() => setTab("dashboard")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
              tab === "dashboard"
                ? "bg-primary-500 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            학습 현황
          </button>
          <button
            onClick={() => setTab("account")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
              tab === "account"
                ? "bg-primary-500 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <UserCog className="w-5 h-5" />
            내 계정
          </button>
        </div>

        {/* Children Tab */}
        {tab === "children" && (
          <div className="space-y-6">
            <form onSubmit={handleCreateChild} className="bg-white rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary-500" />
                자녀 추가
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                아이는 따로 로그인하지 않아요. 이 기기에서 <b>자녀 모드</b>를 누르고 아이 이름을 고르면 공부를 시작해요.
              </p>
              {/* 휴대폰에서는 이름 칸이 한 줄을 차지하고, 학년·추가 버튼은 다음 줄 */}
              <div className="flex flex-wrap sm:flex-nowrap gap-3">
                <input
                  type="text"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="이름 또는 별명 (예: 민준)"
                  maxLength={30}
                  className="input-field w-full sm:w-auto sm:flex-1"
                  required
                />
                <select
                  value={childGrade}
                  onChange={(e) => setChildGrade(Number(e.target.value))}
                  className="input-field flex-1 sm:flex-none sm:w-28"
                  aria-label="학년"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={createLoading || !childConsent}
                  className="btn-primary px-6 whitespace-nowrap disabled:opacity-50"
                >
                  {createLoading ? "추가 중..." : "추가"}
                </button>
              </div>
              <div className="mt-3 text-sm">
                <div className="flex items-start gap-2">
                  <label className="flex items-start gap-2 flex-1 text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={childConsent}
                      onChange={(e) => setChildConsent(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-primary-500 shrink-0"
                    />
                    <span>
                      <span className="text-primary-600 font-medium">[필수]</span> 아이의 보호자(법정대리인)로서 아이의
                      이름·학년·학습 기록을 학습 서비스에 이용하는 데 동의합니다.
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowChildConsentDetail((v) => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
                    aria-expanded={showChildConsentDetail}
                  >
                    내용 {showChildConsentDetail ? "닫기" : "보기"}
                  </button>
                </div>
                {showChildConsentDetail && (
                  <div className="mt-2 ml-6 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 leading-relaxed">
                    <ChildPrivacySummary />
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2 ml-6">실명 대신 별명을 써도 괜찮아요.</p>
              </div>
              {createError && (
                <p className="text-red-500 text-sm mt-2">{createError}</p>
              )}
            </form>

            <div className="bg-white rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">우리 아이들</h2>
              {children.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  아직 등록된 자녀가 없습니다.<br />
                  위에서 자녀를 추가해주세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {children.map((c) => (
                    <div key={c.id} className="p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-800">{c.name}</p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRenameChild(c)}
                          className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors"
                          title="이름 바꾸기"
                          aria-label={`${c.name} 이름 바꾸기`}
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteChild(c)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          title="삭제"
                          aria-label={`${c.name} 삭제`}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    {/* 오늘의 학습 설정 */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1.5 text-gray-600">
                        <input
                          type="checkbox"
                          checked={c.auto_lesson}
                          onChange={(e) => handleChildSetting(c, { auto_lesson: e.target.checked })}
                          className="w-4 h-4 accent-primary-500"
                        />
                        오늘의 학습
                      </label>
                      <select
                        value={c.grade}
                        onChange={(e) =>
                          // 학년을 직접 바꾸면 레벨 테스트 결과 대신 학년 기준으로
                          handleChildSetting(c, { grade: Number(e.target.value), start_level: null })
                        }
                        disabled={!c.auto_lesson}
                        className="px-2 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-50"
                        aria-label={`${c.name} 학년`}
                      >
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                      <select
                        value={c.daily_new_words}
                        onChange={(e) => handleChildSetting(c, { daily_new_words: Number(e.target.value) })}
                        disabled={!c.auto_lesson}
                        className="px-2 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-50"
                        aria-label={`${c.name} 하루 새 단어 수`}
                      >
                        {DAILY_NEW_WORD_OPTIONS.map((n) => (
                          <option key={n} value={n}>새 단어 하루 {n}개</option>
                        ))}
                      </select>
                    </div>
                    {c.auto_lesson && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>
                          {c.start_level ? (
                            <>
                              레벨 테스트 결과: <b className="text-gray-700">{LEVEL_LABELS[c.start_level]}</b>부터
                            </>
                          ) : c.placement_done_at ? (
                            "학년 기준으로 시작"
                          ) : (
                            "레벨 테스트 전 · 학년 기준으로 시작 (자녀 모드에서 테스트할 수 있어요)"
                          )}
                        </span>
                        {c.placement_done_at && (
                          <button
                            onClick={() => handleChildSetting(c, { start_level: null, placement_done_at: null })}
                            className="underline hover:text-primary-600"
                          >
                            레벨 테스트 다시 하기
                          </button>
                        )}
                      </div>
                    )}
                    {rewards[c.id] !== undefined && (
                      <PromiseEditor
                        key={rewards[c.id]?.promise?.id ?? "none"}
                        childId={c.id}
                        childName={c.name}
                        promise={rewards[c.id]?.promise ?? null}
                        onChanged={loadRewards}
                      />
                    )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4">
                오늘의 학습: 아이가 앱을 열면 수준에 맞는 새 단어와 잊어버릴 때가 된 복습 단어를 자동으로 내줘요.
                숙제를 등록한 날은 새 단어 없이 복습만 해요. 최근 정답률이 높으면 새 단어를 늘리고, 낮거나 복습이 밀리면 줄여요.
                학년을 바꾸면 레벨 테스트 결과 대신 학년 기준으로 다음 날부터 적용돼요.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary-500" />
                부모 PIN
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                자녀 모드에서 이 화면으로 돌아올 때 입력하는 숫자 4자리예요. 아이가 단어 숙제나 설정을 바꾸지 못하게 막아줘요.
              </p>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${hasPin ? "text-green-600" : "text-orange-500"}`}>
                  {hasPin ? "설정됨" : "아직 설정하지 않았어요"}
                </span>
                <button
                  onClick={() => setPinDialog(hasPin ? "change" : "setup")}
                  className="px-4 py-2 text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                >
                  {hasPin ? "PIN 바꾸기" : "PIN 정하기"}
                </button>
              </div>
            </div>

            {pinDialog && (
              <ParentPinDialog
                mode={pinDialog}
                onCancel={() => setPinDialog(null)}
                onDone={() => {
                  setPinDialog(null);
                  setHasPin(true);
                  // PIN을 막 정한 탭은 잠금 해제 상태로 유지
                  if (userId) setParentUnlocked(userId, true);
                  alert("부모 PIN을 저장했어요.");
                }}
              />
            )}
          </div>
        )}

        {/* Register Tab */}
        {tab === "register" && (
          <div className="space-y-6">
            {children.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 shadow-md text-center">
                <p className="text-gray-500">먼저 자녀 관리 탭에서 자녀를 등록해주세요.</p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-md">
                  <h2 className="text-xl font-bold text-gray-800 mb-6">
                    새 단어 등록 {selectedChild && <span className="text-primary-500">- {selectedChild.name}</span>}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        제목 (선택)
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="예: Unit 5 단어"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">날짜</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* 카메라 단어 인식 버튼 */}
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex items-center gap-2 py-2 px-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold hover:opacity-90 transition-opacity text-sm"
                    >
                      <Camera className="w-4 h-4" />
                      📷 사진으로 단어 등록
                    </button>
                    <p className="text-xs text-gray-400 mt-1 ml-1">
                      교재나 노트를 찍으면 영어 단어를 읽어 오고, 뜻도 자동으로 채워줘요
                    </p>
                  </div>

                  {/* 주제별 단어장에서 채우기 */}
                  <div className="mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={fillTheme}
                        onChange={(e) => setFillTheme(e.target.value)}
                        className="px-3 py-2 rounded-xl border-2 border-gray-200 bg-white text-sm"
                        aria-label="단어장 주제"
                      >
                        <option value="">📚 단어장에서 채우기 (주제 선택)</option>
                        {themeOptions.map((t) => (
                          <option key={t.theme} value={t.theme}>
                            {THEME_EMOJI[t.theme] ?? "📖"} {t.theme} · {t.count}단어
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleFillFromTheme}
                        disabled={!fillTheme}
                        className="py-2 px-4 rounded-xl bg-primary-50 text-primary-600 font-bold text-sm hover:bg-primary-100 disabled:opacity-50"
                      >
                        빈칸 채우기
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 ml-1">
                      고른 주제에서 {selectedChild?.name ?? "아이"}가 아직 안 배운 단어부터 빈칸에 넣어 줘요. 넣은 뒤 고쳐도 돼요.
                    </p>
                  </div>

                  {/* 뜻 자동 채우기 */}
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={handleAutoMeanings}
                      disabled={meaningBusy}
                      className="flex items-center gap-2 py-2 px-4 rounded-xl bg-yellow-50 text-yellow-700 font-bold text-sm hover:bg-yellow-100 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {meaningBusy ? "뜻 찾는 중..." : "뜻 자동 채우기"}
                    </button>
                    <p className="text-xs text-gray-400 mt-1 ml-1">
                      영어만 쓰면 뜻은 자동으로 채워요. 사전에 없는 단어는 AI가 초등학생 눈높이로 찾아요.
                    </p>
                    {meaningMsg && (
                      <p className="text-sm text-gray-600 mt-2 ml-1" role="status">
                        {meaningMsg}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-sm font-medium text-gray-500 px-1">
                      <div className="col-span-1">#</div>
                      <div className="col-span-5">영어</div>
                      <div className="col-span-6">한국어 뜻</div>
                    </div>
                    {words.map((word, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 text-center text-sm font-bold text-gray-400">
                          {i + 1}
                        </div>
                        <div className="col-span-5">
                          <input
                            type="text"
                            value={word.english}
                            onChange={(e) => updateWord(i, "english", e.target.value)}
                            onBlur={() => handleEnglishBlur(i)}
                            placeholder="apple"
                            className="input-field text-sm"
                            aria-label={`${i + 1}번 영어`}
                          />
                        </div>
                        <div className="col-span-6 relative">
                          <input
                            type="text"
                            value={word.korean}
                            onChange={(e) => updateWord(i, "korean", e.target.value)}
                            placeholder={lookingUp.includes(i) ? "뜻 찾는 중..." : "사과"}
                            className={`input-field text-sm ${word.auto ? "pr-12" : ""}`}
                            aria-label={`${i + 1}번 뜻`}
                          />
                          {word.auto && (
                            <span
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded"
                              title="뜻을 자동으로 채웠어요. 틀리면 고쳐주세요."
                            >
                              자동
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full mt-6 disabled:opacity-50"
                  >
                    {loading ? "등록 중..." : "단어 등록하기"}
                  </button>
                </form>

                {/* Word Set History */}
                <div className="bg-white rounded-3xl p-6 shadow-md">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    등록된 단어 목록 {selectedChild && <span className="text-sm text-gray-400">({selectedChild.name})</span>}
                  </h2>
                  {wordSets.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">아직 등록된 단어가 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {wordSets.map((ws) => (
                        <div key={ws.id} className="border rounded-2xl overflow-hidden">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleExpand(ws.id)}
                          >
                            <div className="flex items-center gap-3">
                              <BookOpen className="w-5 h-5 text-primary-500" />
                              <div>
                                {ws.source === "auto" && (
                                  <span className="mr-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
                                    자동
                                  </span>
                                )}
                                {ws.source === "theme" && (
                                  <span className="mr-2 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                                    단어장
                                  </span>
                                )}
                                <span className="font-medium text-gray-800">
                                  {ws.title || formatDate(ws.date)}
                                </span>
                                <span className="text-sm text-gray-400 ml-2">
                                  {ws.words?.length || 0}개 단어
                                </span>
                                {ws.note && <span className="block text-xs text-gray-400 mt-0.5">{ws.note}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">{formatDate(ws.date)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(ws.id);
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {expandedSet === ws.id ? (
                                <ChevronUp className="w-5 h-5 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </div>
                          {expandedSet === ws.id && (
                            <div className="border-t px-4 py-3 bg-gray-50">
                              <div className="grid grid-cols-3 gap-2 text-sm font-medium text-gray-500 mb-2">
                                <div>영어</div>
                                <div>한국어</div>
                                <div>정답률</div>
                              </div>
                              {ws.words?.map((w) => {
                                const stat = wordStats.find((s) => s.word_id === w.id);
                                const total = stat ? stat.correct + stat.incorrect : 0;
                                const accuracy = total > 0 ? Math.round((stat.correct / total) * 100) : -1;
                                return (
                                  <div key={w.id} className="grid grid-cols-3 gap-2 text-sm py-1">
                                    <div className="font-medium text-gray-800">{w.english}</div>
                                    <div className="text-gray-600">{w.korean}</div>
                                    <div className={accuracy >= 0 ? getAccuracyColor(accuracy) : "text-gray-400"}>
                                      {accuracy >= 0 ? `${accuracy}%` : "미학습"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Dashboard Tab */}
        {tab === "dashboard" && stats && (
          <div className="space-y-6">
            {selectedChildId && goals[selectedChildId] && (
              <WeekGoalCard status={goals[selectedChildId]!} />
            )}
            {selectedChildId && rewards[selectedChildId] && <BadgeSummary status={rewards[selectedChildId]!} />}
            {/* 알파벳: 연습한 적이 있거나 "영어 처음"인 아이만 */}
            {alphabet && (Object.keys(alphabet).length > 0 || selectedChild?.grade === 0) && <AlphabetSummary progress={alphabet} />}
            {progress && <WordProgressCard progress={progress} />}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-md text-center">
                <BookOpen className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-800">{stats.totalSets}</div>
                <div className="text-sm text-gray-500">등록 세트</div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-md text-center">
                <Target className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-800">{stats.totalRecords}</div>
                <div className="text-sm text-gray-500">총 학습 횟수</div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-md text-center">
                <BarChart3 className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <div className={`text-2xl font-bold ${getAccuracyColor(stats.accuracy)}`}>
                  {stats.accuracy}%
                </div>
                <div className="text-sm text-gray-500">전체 정답률</div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-md text-center">
                <Trophy className="w-8 h-8 text-kid-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-800">{stats.rewardCount}</div>
                <div className="text-sm text-gray-500">획득 보상</div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">모듈별 학습 현황</h2>
              {Object.keys(stats.moduleStats).length === 0 ? (
                <p className="text-gray-400 text-center py-8">아직 학습 기록이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.moduleStats).map(([module, data]: [string, any]) => {
                    const accuracy = Math.round((data.correct / data.total) * 100);
                    return (
                      <div key={module} className="flex items-center gap-4">
                        <div className="w-24 text-sm font-medium text-gray-600">
                          {MODULE_LABEL[module] ?? module}
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
                            style={{ width: `${accuracy}%` }}
                          />
                        </div>
                        <div className={`text-sm font-bold w-12 text-right ${getAccuracyColor(accuracy)}`}>
                          {accuracy}%
                        </div>
                        <div className="text-xs text-gray-400 w-16 text-right">
                          {data.total}회
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 날짜별 통계 — 히트맵 + 상세 리스트 */}
            <DailyStatsSection
              dailyStats={dailyStats}
              days={heatmapDays}
              onChangeDays={setHeatmapDays}
            />
          </div>
        )}

        {/* 내 계정 */}
        {tab === "account" && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">계정 정보</h2>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                <dt className="text-gray-500">이름</dt>
                <dd className="text-gray-800">{profile?.name || "-"}</dd>
                <dt className="text-gray-500">이메일</dt>
                <dd className="text-gray-800 break-all">{user?.email ?? profile?.email}</dd>
                <dt className="text-gray-500">약관 동의</dt>
                <dd className="text-gray-800">
                  {termsVersion ? `${termsVersion} 버전에 동의함` : "-"}
                  <span className="text-gray-400">
                    {" "}(
                    <Link href="/terms" target="_blank" className="underline hover:text-gray-600">이용약관</Link>
                    {" · "}
                    <Link href="/privacy" target="_blank" className="underline hover:text-gray-600">개인정보 처리방침</Link>
                    )
                  </span>
                </dd>
              </dl>
            </div>

            <InstallAppSection />

            <form onSubmit={handleChangePassword} className="bg-white rounded-3xl p-6 shadow-md space-y-3">
              <h2 className="text-xl font-bold text-gray-800">비밀번호 바꾸기</h2>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새 비밀번호 (6자 이상)"
                autoComplete="new-password"
                aria-label="새 비밀번호"
                className="input-field w-full"
                minLength={6}
                required
              />
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="새 비밀번호 확인"
                autoComplete="new-password"
                aria-label="새 비밀번호 확인"
                className="input-field w-full"
                minLength={6}
                required
              />
              {passwordMsg && (
                <p className={`text-sm ${passwordMsg.ok ? "text-green-600" : "text-red-500"}`}>{passwordMsg.text}</p>
              )}
              <button type="submit" disabled={passwordSaving} className="btn-primary px-6 disabled:opacity-50">
                {passwordSaving ? "저장 중..." : "비밀번호 바꾸기"}
              </button>
            </form>

            <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-red-100">
              <h2 className="text-xl font-bold text-gray-800 mb-2">회원 탈퇴</h2>
              <p className="text-sm text-gray-500 mb-4">
                탈퇴하면 계정과 자녀 프로필, 단어 숙제, 학습 기록이 바로 삭제되고 되돌릴 수 없어요.
                자녀 한 명의 기록만 지우려면 자녀 관리에서 그 자녀를 삭제하세요.
              </p>
              <button
                onClick={() => setDeletingAccount(true)}
                className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
              >
                회원 탈퇴
              </button>
            </div>
          </div>
        )}

        <LegalFooter className="mt-12" />
      </div>

      {deletingAccount && (
        <DeleteAccountDialog
          email={user?.email ?? profile?.email ?? ""}
          childNames={children.map((c) => c.name)}
          onCancel={() => setDeletingAccount(false)}
        />
      )}

      {/* Camera OCR Modal */}
      {showCamera && (
        <CameraOcr
          onWordsDetected={handleWordsFromCamera}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ===================== 날짜별 통계 컴포넌트 =====================

const MODULE_LABEL: Record<string, string> = MODULE_SHORT_NAMES;

// 아이별 단어 학습 상태 요약 (망각곡선 복습 기준)
// 학습 현황: 이번 주 요약 + 이번 달 도장판
function WeekGoalCard({ status }: { status: GoalStatus }) {
  const w = status.week;
  const accuracy = w.answers > 0 ? Math.round((w.correct / w.answers) * 100) : null;
  const items = [
    { label: "학습한 날", value: `${w.studied_days}일` },
    { label: "목표 달성", value: `${w.met_days}일` },
    { label: "푼 문제 · 정답률", value: `${w.answers}개${accuracy !== null ? ` · ${accuracy}%` : ""}` },
    { label: "새로 배운 단어", value: `${w.new_words}개` },
  ];
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md" aria-label="이번 주">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">이번 주 (월요일부터)</h3>
        <span className="text-sm text-orange-600 font-bold">🔥 {status.streak}일 연속 · 최고 {status.best_streak}일</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {items.map((it) => (
          <div key={it.label} className="bg-gray-50 rounded-2xl p-3 text-center">
            <div className="text-xl font-extrabold text-gray-800">{it.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{it.label}</div>
          </div>
        ))}
      </div>
      <StampCalendar status={status} />
      <p className="text-xs text-gray-400 mt-3">
        오늘의 목표: 그날 숙제(없으면 오늘의 학습) 단어를 모두 한 번 이상 맞히기. 일주일에 하루는 빠져도 연속 기록이 이어져요.
      </p>
    </div>
  );
}

function WordProgressCard({ progress }: { progress: WordProgressSummary }) {
  const items = [
    { label: "학습한 단어", value: progress.studied, color: "text-primary-600" },
    { label: "익힌 단어", value: progress.mastered, color: "text-green-600", hint: "다른 날 3번 연속 정답" },
    { label: "오늘 복습할 단어", value: progress.dueToday, color: "text-orange-500" },
  ];
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary-500" />
        단어 학습 상태
      </h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {items.map((it) => (
          <div key={it.label} className="bg-gray-50 rounded-2xl p-3 text-center" title={it.hint}>
            <div className={`text-2xl font-extrabold ${it.color}`}>{it.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{it.label}</div>
          </div>
        ))}
      </div>
      {progress.weakWords.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">자주 틀리는 단어</p>
          <div className="flex flex-wrap gap-2">
            {progress.weakWords.map((w) => (
              <span key={w.english} className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-sm">
                {w.english}
                {w.korean && <span className="text-red-400"> · {w.korean}</span>}
                <span className="text-red-300 ml-1">{w.wrong_count}회</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">틀린 단어는 다음 날 오늘의 학습에 복습으로 다시 나와요.</p>
        </div>
      ) : (
        <p className="text-sm text-gray-400">아직 틀린 단어가 없어요.</p>
      )}
    </div>
  );
}

function heatColor(records: number, accuracy: number): string {
  if (records === 0) return "bg-gray-100";
  // 활동량 + 정답률을 결합한 색상
  const intensity = Math.min(records / 30, 1); // 최대 30회 기록 = 진한 색
  if (accuracy >= 80) {
    if (intensity > 0.7) return "bg-green-500";
    if (intensity > 0.4) return "bg-green-400";
    if (intensity > 0.15) return "bg-green-300";
    return "bg-green-200";
  }
  if (accuracy >= 50) {
    if (intensity > 0.7) return "bg-yellow-500";
    if (intensity > 0.4) return "bg-yellow-400";
    return "bg-yellow-300";
  }
  if (intensity > 0.7) return "bg-orange-500";
  if (intensity > 0.4) return "bg-orange-400";
  return "bg-orange-300";
}

function DailyStatsSection({
  dailyStats,
  days,
  onChangeDays,
}: {
  dailyStats: DailyStats[];
  days: 30 | 60 | 90;
  onChangeDays: (d: 30 | 60 | 90) => void;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // 활동 있는 날만 필터링 (상세 리스트용), 최신순
  const activeDays = [...dailyStats]
    .filter((d) => d.totalRecords > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 히트맵 그리드: 7열(요일) x N행, 가장 오래된 날부터
  // 시작 요일을 맞추기 위해 패딩
  const firstDate = dailyStats[0] ? parseLocalDate(dailyStats[0].date) : new Date();
  const startDow = firstDate.getDay(); // 0(일) ~ 6(토)
  const paddedCells: (DailyStats | null)[] = Array(startDow).fill(null).concat(dailyStats);

  return (
    <div className="bg-white rounded-3xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          날짜별 학습 통계
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => onChangeDays(d as 30 | 60 | 90)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                days === d ? "bg-white text-primary-600 shadow" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* 히트맵 */}
      <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
        <span>{formatDate(dailyStats[0]?.date ?? "")}</span>
        <span>{formatDate(dailyStats[dailyStats.length - 1]?.date ?? "")}</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 mb-3 overflow-x-auto">
        {paddedCells.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} className="w-3.5 h-3.5" />;
          const isActive = d.totalRecords > 0;
          return (
            <div
              key={d.date}
              title={`${d.date} · ${d.totalRecords}회 · 정답률 ${d.accuracy}%${d.examBestScore !== null ? ` · 시험 ${d.examBestScore}점` : ""}`}
              onClick={() => isActive && setExpandedDate(d.date === expandedDate ? null : d.date)}
              className={`w-3.5 h-3.5 rounded-sm ${heatColor(d.totalRecords, d.accuracy)} ${
                isActive ? "cursor-pointer hover:ring-2 hover:ring-primary-400" : ""
              } ${expandedDate === d.date ? "ring-2 ring-primary-500" : ""}`}
            />
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <span>적음</span>
        <div className="w-3 h-3 rounded-sm bg-gray-100" />
        <div className="w-3 h-3 rounded-sm bg-green-200" />
        <div className="w-3 h-3 rounded-sm bg-green-300" />
        <div className="w-3 h-3 rounded-sm bg-green-400" />
        <div className="w-3 h-3 rounded-sm bg-green-500" />
        <span>많음</span>
        <span className="ml-3">|</span>
        <span>녹색: 정답률 80%↑</span>
        <span>노랑: 50~79%</span>
        <span>주황: ~49%</span>
      </div>

      {/* 상세 리스트 */}
      {activeDays.length === 0 ? (
        <p className="text-gray-400 text-center py-8">선택한 기간에 학습 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {activeDays.map((d) => (
            <DailyRow
              key={d.date}
              day={d}
              expanded={expandedDate === d.date}
              onToggle={() => setExpandedDate(d.date === expandedDate ? null : d.date)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DailyRow({
  day,
  expanded,
  onToggle,
}: {
  day: DailyStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const moduleEntries = Object.entries(day.moduleStats).filter(([m]) => m !== "exam");
  const hasExam = day.examBestScore !== null;

  return (
    <div className="border rounded-2xl overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Calendar className="w-5 h-5 text-primary-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-800 truncate">{formatDate(day.date)}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {day.totalRecords}회 학습 · {Object.keys(day.moduleStats).length}개 모듈
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasExam && (
            <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-lg text-xs font-bold">
              <Award className="w-3.5 h-3.5" />
              시험 {day.examBestScore}점
            </div>
          )}
          <div className={`text-lg font-bold ${getAccuracyColor(day.accuracy)}`}>
            {day.accuracy}%
          </div>
          {day.rewardCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Trophy className="w-3.5 h-3.5 text-kid-yellow" />
              {day.rewardCount}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t bg-gray-50 p-4">
          {moduleEntries.length === 0 && !hasExam ? (
            <p className="text-gray-400 text-sm text-center py-2">모듈 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {moduleEntries.map(([mod, stat]) => (
                <div key={mod} className="flex items-center gap-3 text-sm">
                  <div className="w-20 text-gray-600 font-medium">{MODULE_LABEL[mod] ?? mod}</div>
                  <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full"
                      style={{ width: `${stat.accuracy}%` }}
                    />
                  </div>
                  <div className={`w-12 text-right font-bold ${getAccuracyColor(stat.accuracy)}`}>
                    {stat.accuracy}%
                  </div>
                  <div className="w-12 text-right text-xs text-gray-400">{stat.sessions}회</div>
                </div>
              ))}
              {hasExam && (
                <div className="flex items-center gap-3 text-sm pt-2 border-t mt-2">
                  <div className="w-20 text-yellow-700 font-bold flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    시험
                  </div>
                  <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"
                      style={{ width: `${day.examBestScore}%` }}
                    />
                  </div>
                  <div className={`w-12 text-right font-bold ${getAccuracyColor(day.examBestScore!)}`}>
                    {day.examBestScore}점
                  </div>
                  <div className="w-12 text-right text-xs text-gray-400">
                    {day.moduleStats["exam"]?.sessions ?? 1}회
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
