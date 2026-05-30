const FEMALE_VOICE_KEYWORDS = [
  "Female",
  "Samantha",
  "Victoria",
  "Karen",
  "Kate",
  "Serena",
  "Zira",
  "Google US English",
  "Tessa",
  "Frederica",
  "Joanna",
  "Kendra",
  "Kimberly",
  "Salli",
  "Amy",
  "Emma",
];

function isFemaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  // 남성 목소리 제외
  if (name.includes("male") || name.includes("daniel") || name.includes("fred") || name.includes("bruce")) {
    return false;
  }
  // 여성 목소리 키워드 확인
  return FEMALE_VOICE_KEYWORDS.some((keyword) =>
    name.includes(keyword.toLowerCase())
  );
}

export function speakEnglish(text: string, rate: number = 0.8): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = 1.1; // 약간 높은 pitch로 여성스러운 느낌
  utterance.volume = 1;

  // 영어 여성 음성 선택 (우선순위 순)
  const voices = window.speechSynthesis.getVoices();
  let englishVoice = voices.find(
    (v) => v.lang.startsWith("en") && isFemaleVoice(v)
  );

  // 여성 음성을 찾지 못했으면 Samantha나 Google US English 시도
  if (!englishVoice) {
    englishVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Samantha") || v.name.includes("Google US"))
    );
  }

  // 그래도 없으면 그냥 첫 번째 영어 음성
  if (!englishVoice) {
    englishVoice = voices.find((v) => v.lang.startsWith("en"));
  }

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

export function initVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}
