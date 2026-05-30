// Web Audio API를 사용한 효과음 생성

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  return new (window.AudioContext || (window as any).webkitAudioContext)();
}

// 정답 효과음: 밝은 "딩동뎅" + 성취감
export function playCorrectSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 오실레이터 1: 높은 "딩" 소리
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now); // A5
  osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // A6로 상승
  gain1.gain.setValueAtTime(0.3, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc1.start(now);
  osc1.stop(now + 0.3);

  // 오실레이터 2: 화음 "동"
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1109, now + 0.1); // C#6
  gain2.gain.setValueAtTime(0, now + 0.1);
  gain2.gain.linearRampToValueAtTime(0.25, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
  osc2.start(now + 0.1);
  osc2.stop(now + 0.5);

  // 오실레이터 3: 마지막 "뎅" (높은 화음)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.type = "triangle";
  osc3.frequency.setValueAtTime(1760, now + 0.2); // A6
  gain3.gain.setValueAtTime(0, now + 0.2);
  gain3.gain.linearRampToValueAtTime(0.2, now + 0.25);
  gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
  osc3.start(now + 0.2);
  osc3.stop(now + 0.6);

  // 반짝이는 느낌의 high frequency burst
  for (let i = 0; i < 8; i++) {
    const spark = ctx.createOscillator();
    const sparkGain = ctx.createGain();
    spark.connect(sparkGain);
    sparkGain.connect(ctx.destination);
    spark.type = "sine";
    spark.frequency.setValueAtTime(3000 + i * 500, now + 0.15 + i * 0.03);
    sparkGain.gain.setValueAtTime(0.05, now + 0.15 + i * 0.03);
    sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + i * 0.03);
    spark.start(now + 0.15 + i * 0.03);
    spark.stop(now + 0.22 + i * 0.03);
  }
}

// 오답 효과음: 부드러운 "띵" (격려 느낌, 너무 충격적이지 않게)
export function playWrongSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 주파수: 낮은쪽으로 살짝 내려가는 느낌
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now); // A4
  osc.frequency.exponentialRampToValueAtTime(330, now + 0.3); // E4로 하강
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  osc.start(now);
  osc.stop(now + 0.4);

  // 두 번째 음 (화음 - 약간 안정감)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(554, now); // C#5
  osc2.frequency.exponentialRampToValueAtTime(415, now + 0.3); // G#4로 하강
  gain2.gain.setValueAtTime(0.2, now);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  osc2.start(now);
  osc2.stop(now + 0.4);
}

// 콤보 효과음: 연속 정답 시 추가 보너스
export function playComboSound(combo: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const baseFreq = 880;

  // 콤보 수에 따라 음을 추가
  for (let i = 0; i < Math.min(combo, 5); i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // 계단식 상승 음계
    const freq = baseFreq * (1 + i * 0.5);
    osc.frequency.setValueAtTime(freq, now + i * 0.08);
    gain.gain.setValueAtTime(0, now + i * 0.08);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.25);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.3);
  }

  // 마지막 하이라이트
  if (combo >= 3) {
    const finalOsc = ctx.createOscillator();
    const finalGain = ctx.createGain();
    finalOsc.connect(finalGain);
    finalGain.connect(ctx.destination);
    finalOsc.type = "triangle";
    finalOsc.frequency.setValueAtTime(1760, now + combo * 0.08);
    finalGain.gain.setValueAtTime(0, now + combo * 0.08);
    finalGain.gain.linearRampToValueAtTime(0.3, now + combo * 0.08 + 0.05);
    finalGain.gain.exponentialRampToValueAtTime(0.01, now + combo * 0.08 + 0.5);
    finalOsc.start(now + combo * 0.08);
    finalOsc.stop(now + combo * 0.08 + 0.5);
  }
}

// 완료/만점 효과음: 환호하는 느낌
export function playSuccessSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 멜로디 1: "짠짠짠짠~"
  const melody = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (C Major)
  melody.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + i * 0.15);
    gain.gain.setValueAtTime(0, now + i * 0.15);
    gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.4);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.5);
  });

  // 멜로디 2: 화음
  const harmony = [392, 523.25, 659.25]; // G4, C5, E5
  harmony.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + 0.6 + i * 0.2);
    gain.gain.setValueAtTime(0, now + 0.6 + i * 0.2);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.6 + i * 0.2 + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6 + i * 0.2 + 0.6);
    osc.start(now + 0.6 + i * 0.2);
    osc.stop(now + 0.6 + i * 0.2 + 0.8);
  });
}
