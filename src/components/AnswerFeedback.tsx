"use client";

import { useEffect, useRef, useState } from "react";

interface Particle {
  id: number;
  tx: string;
  ty: string;
  emoji: string;
  left: string;
  top: string;
  delay: string;
}

const CORRECT_EMOJIS = ["⭐", "✨", "🌟", "💫", "🎉", "🎊", "🏅"];
const CORRECT_MESSAGES = [
  "정답! 🎉",
  "완벽해요! ⭐",
  "최고예요! 🌟",
  "맞아요! 💯",
  "훌륭해요! 🏆",
  "대단해요! 🔥",
];
const WRONG_MESSAGES = [
  "아쉽지만 괜찮아요! 💪",
  "다시 해봐요! 🌈",
  "조금만 더! 😊",
  "할 수 있어요! 💖",
];

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface AnswerFeedbackProps {
  show: boolean;
  isCorrect: boolean;
  combo?: number;
  word?: string;
}

export default function AnswerFeedback({ show, isCorrect, combo = 0, word }: AnswerFeedbackProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [message, setMessage] = useState("");
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!show) return;

    setKey((k) => k + 1);

    if (isCorrect) {
      setMessage(CORRECT_MESSAGES[randomBetween(0, CORRECT_MESSAGES.length - 1)]);
      const newParticles: Particle[] = Array.from({ length: 12 }, (_, i) => ({
        id: i,
        tx: `${randomBetween(-80, 80)}px`,
        ty: `${randomBetween(-120, -30)}px`,
        emoji: CORRECT_EMOJIS[randomBetween(0, CORRECT_EMOJIS.length - 1)],
        left: `${randomBetween(20, 80)}%`,
        top: `${randomBetween(30, 70)}%`,
        delay: `${randomBetween(0, 200)}ms`,
      }));
      setParticles(newParticles);
    } else {
      setMessage(WRONG_MESSAGES[randomBetween(0, WRONG_MESSAGES.length - 1)]);
      setParticles([]);
    }
  }, [show, isCorrect]);

  if (!show) return null;

  return (
    <div
      key={key}
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center animate-feedback-fade"
    >
      {/* 배경 플래시 */}
      <div
        className={`absolute inset-0 opacity-20 ${
          isCorrect ? "bg-green-400" : "bg-red-400"
        }`}
      />

      {/* 파티클 */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute text-2xl animate-star-fly"
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            "--tx": p.tx,
            "--ty": p.ty,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}

      {/* 메인 메시지 박스 */}
      <div className={`animate-pop-in relative z-10 px-8 py-5 rounded-3xl shadow-2xl text-center
        ${isCorrect
          ? "bg-gradient-to-br from-green-400 to-emerald-500"
          : "bg-gradient-to-br from-red-400 to-rose-500"
        }`}
      >
        <div className="text-4xl mb-1">
          {isCorrect ? (combo >= 3 ? "🔥" : "⭐") : "💪"}
        </div>
        <div className="text-white font-extrabold text-xl tracking-wide">
          {message}
        </div>
        {combo >= 2 && isCorrect && (
          <div className="mt-2 animate-combo">
            <span className="bg-yellow-400 text-yellow-900 font-extrabold text-sm px-3 py-1 rounded-full">
              {combo} 연속 정답! 🔥
            </span>
          </div>
        )}
        {word && isCorrect && (
          <div className="mt-2 text-white/80 text-sm font-medium">
            {word}
          </div>
        )}
      </div>
    </div>
  );
}
