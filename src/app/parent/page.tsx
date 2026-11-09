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
} from "lucide-react";
import CameraOcr from "@/components/CameraOcr";
import TtsStatusBadge from "@/components/TtsStatusBadge";
import ParentPinDialog from "@/components/ParentPinDialog";
import LegacyStudentNotice from "@/components/LegacyStudentNotice";
import { WordSet, Child } from "@/lib/types";
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
  hasParentPin,
  getDailyStatsRange,
  DailyStats,
} from "@/lib/api";
import { formatDate, getTodayString, getAccuracyColor, parseLocalDate } from "@/lib/utils";
import { useAuth, isLegacyStudent } from "@/lib/auth-context";
import { isParentUnlocked, setParentUnlocked } from "@/lib/child-mode";

interface WordInput {
  english: string;
  korean: string;
}

const emptyWords = (): WordInput[] =>
  Array.from({ length: 10 }, () => ({ english: "", korean: "" }));

export default function ParentPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState<"register" | "dashboard" | "children">("children");
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
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [heatmapDays, setHeatmapDays] = useState<30 | 60 | 90>(30);
  const [showCamera, setShowCamera] = useState(false);
  const [gateChecked, setGateChecked] = useState(false); // 부모 PIN 잠금 확인 끝
  const [hasPin, setHasPin] = useState(false);
  const [pinDialog, setPinDialog] = useState<"setup" | "change" | null>(null);

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
      setGateChecked(true);
      loadChildren();
    })();
  }, [userId, legacy, authLoading]);

  useEffect(() => {
    if (selectedChildId) loadData();
  }, [selectedChildId, heatmapDays]);

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
    const [sets, dashStats, daily] = await Promise.all([
      getWordSetsByChild(selectedChildId),
      getDashboardStats(selectedChildId),
      getDailyStatsRange(selectedChildId, heatmapDays),
    ]);
    setDailyStats(daily);
    setWordSets(sets);
    setStats(dashStats);
  }

  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return;
    setCreateLoading(true);
    setCreateError("");
    const { child, error } = await createChild(name);
    if (error || !child) {
      setCreateError("자녀를 추가하지 못했어요. 이름은 1~30자로 입력해주세요.");
    } else {
      setChildName("");
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
    const validWords = words.filter((w) => w.english.trim() && w.korean.trim());
    if (validWords.length === 0) {
      alert("최소 1개 이상의 단어를 입력해주세요.");
      return;
    }

    setLoading(true);
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
    const newWords = [...words];
    newWords[index] = { ...newWords[index], [field]: value };
    setWords(newWords);
  }

  // 카메라로 인식된 단어들을 폼에 채워넣기
  function handleWordsFromCamera(detectedWords: { english: string; korean: string }[]) {
    setShowCamera(false);
    if (detectedWords.length === 0) return;

    // 기존 빈 슬롯에 단어 채우기
    const newWords = [...words];
    let filledCount = 0;

    for (let i = 0; i < newWords.length && filledCount < detectedWords.length; i++) {
      if (!newWords[i].english && !newWords[i].korean) {
        newWords[i] = {
          english: detectedWords[filledCount].english,
          korean: detectedWords[filledCount].korean,
        };
        filledCount++;
      }
    }

    // 남은 단어가 있으면 추가 슬롯 생성
    const remainingWords = detectedWords.slice(filledCount);
    for (const word of remainingWords) {
      newWords.push(word);
    }

    setWords(newWords);
    alert(`${detectedWords.length}개 단어가 인식되어 입력되었습니다!`);
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

  if (legacy) return <LegacyStudentNotice />;

  if (authLoading || !gateChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-4xl animate-bounce-slow">📚</div>
      </div>
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
              <div className="flex gap-3">
                <input
                  type="text"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="이름 (예: 민준)"
                  maxLength={30}
                  className="input-field flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn-primary px-6 whitespace-nowrap disabled:opacity-50"
                >
                  {createLoading ? "추가 중..." : "추가"}
                </button>
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
                    <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
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
                  ))}
                </div>
              )}
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
                      📷 카메라로 단어 찍어 등록
                    </button>
                    <p className="text-xs text-gray-400 mt-1 ml-1">
                      교재나 노트를 카메라로 찍으면 자동으로 단어를 인식해줍니다
                    </p>
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
                            placeholder="apple"
                            className="input-field text-sm"
                          />
                        </div>
                        <div className="col-span-6">
                          <input
                            type="text"
                            value={word.korean}
                            onChange={(e) => updateWord(i, "korean", e.target.value)}
                            placeholder="사과"
                            className="input-field text-sm"
                          />
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
                                <span className="font-medium text-gray-800">
                                  {ws.title || formatDate(ws.date)}
                                </span>
                                <span className="text-sm text-gray-400 ml-2">
                                  {ws.words?.length || 0}개 단어
                                </span>
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
                        <div className="w-24 text-sm font-medium text-gray-600 capitalize">
                          {module}
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
      </div>

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

const MODULE_LABEL: Record<string, string> = {
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
};

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
