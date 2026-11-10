"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, Scan, Loader2, ImageIcon } from "lucide-react";
import Tesseract from "tesseract.js";
import { preprocessForOcr } from "@/lib/ocr-image";
import { extractWordPairs } from "@/lib/ocr-words";
import { lookupMeanings } from "@/lib/api";
import { normalizeEnglish } from "@/lib/meaning";

export interface CameraWord {
  english: string;
  korean: string;
  auto?: boolean; // 뜻을 자동으로 채움
}

interface CameraOcrProps {
  onWordsDetected: (words: CameraWord[]) => void;
  onClose: () => void;
}

interface Row extends CameraWord {
  checked: boolean;
}

// 교재·노트 사진에서 영어 단어 인식 → 확인·수정 → 단어 등록 칸에 넣기.
// 사진은 이 기기 안에서만 처리한다 (서버로 보내지 않음).
export default function CameraOcr({ onWordsDetected, onClose }: CameraOcrProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [readKorean, setReadKorean] = useState(false); // 책에 있는 한국어 뜻도 읽기
  const [rows, setRows] = useState<Row[] | null>(null); // 인식 결과 (확인 단계)
  const [meaningLoading, setMeaningLoading] = useState(false);
  const [meaningNote, setMeaningNote] = useState("");

  // 카메라 화면: video가 그려진 뒤에 스트림을 연결한다
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [stream]);

  const stopCamera = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  // 화면을 닫으면 카메라도 끈다
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
    } catch {
      setError("카메라를 쓸 수 없어요. 브라우저 설정에서 카메라 권한을 허용하거나, 갤러리에서 사진을 골라주세요.");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.92));
    stopCamera();
  }, [stopCamera]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setRows(null);
      setError(null);
      setCapturedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // 뜻이 비어 있는 단어는 사전 → AI 순서로 자동으로 채운다
  const fillMeanings = useCallback(async (current: Row[]) => {
    const missing = current.filter((r) => r.english.trim() && !r.korean.trim()).map((r) => r.english);
    if (missing.length === 0) return;
    setMeaningLoading(true);
    setMeaningNote("");
    const { meanings, aiUnavailable } = await lookupMeanings(missing);
    const notFound = missing.filter((w) => !meanings.get(normalizeEnglish(w))).length;
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.korean.trim()) return r;
            const k = meanings.get(normalizeEnglish(r.english));
            return k ? { ...r, korean: k, auto: true } : r;
          })
        : prev
    );
    setMeaningLoading(false);
    if (notFound > 0 || aiUnavailable) {
      setMeaningNote(
        aiUnavailable
          ? "일부 단어는 뜻을 자동으로 찾지 못했어요. 빈칸은 직접 입력해주세요."
          : "뜻을 찾지 못한 단어가 있어요. 철자를 확인하거나 직접 입력해주세요."
      );
    }
  }, []);

  const runOcr = useCallback(async () => {
    if (!capturedImage) return;
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setStatus("사진 다듬는 중");
    let worker: Tesseract.Worker | null = null;
    try {
      const canvas = await preprocessForOcr(capturedImage);
      setStatus(readKorean ? "인식 준비 중 (한국어 포함, 처음엔 조금 걸려요)" : "인식 준비 중");
      worker = await Tesseract.createWorker(readKorean ? ["eng", "kor"] : "eng", Tesseract.OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStatus("글자 읽는 중");
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO, preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      const found = extractWordPairs(lines, readKorean);
      if (found.length === 0) {
        setError("인식한 영어 단어가 없어요. 단어 목록이 화면을 가득 채우게, 밝은 곳에서 반듯하게 다시 찍어주세요.");
        return;
      }
      const initial: Row[] = found.map((f) => ({ english: f.english, korean: f.korean, checked: f.likely, auto: false }));
      setRows(initial);
      void fillMeanings(initial);
    } catch (err) {
      console.error("OCR error:", err);
      setError("글자를 읽다가 문제가 생겼어요. 인터넷 연결을 확인하고 다시 시도해주세요.");
    } finally {
      await worker?.terminate().catch(() => {});
      setIsProcessing(false);
    }
  }, [capturedImage, readKorean, fillMeanings]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r, k) => (k === i ? { ...r, ...patch } : r)) : prev));
  }

  function retake() {
    setCapturedImage(null);
    setRows(null);
    setError(null);
    setMeaningNote("");
    setProgress(0);
    startCamera(facingMode);
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  function toggleCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    stopCamera();
    setFacingMode(next);
    setTimeout(() => startCamera(next), 100);
  }

  function addSelected() {
    if (!rows) return;
    onWordsDetected(
      rows
        .filter((r) => r.checked && r.english.trim())
        .map((r) => ({ english: r.english.trim(), korean: r.korean.trim(), auto: r.auto }))
    );
  }

  const selectedCount = rows?.filter((r) => r.checked && r.english.trim()).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="사진으로 단어 등록">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 text-white">
            <Scan className="w-5 h-5" />
            <span className="font-bold">사진으로 단어 등록</span>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white p-1" aria-label="닫기">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

          {rows ? (
            // ---------- 확인 단계 ----------
            <div>
              <p className="text-sm text-gray-600 mb-3">
                인식한 단어 <b>{rows.length}개</b>예요. 넣을 단어를 고르고, 틀린 글자나 뜻은 고쳐주세요.
              </p>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1" aria-label="인식한 단어">
                {rows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 ${r.checked ? "" : "opacity-50"}`}>
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => updateRow(i, { checked: e.target.checked })}
                      className="w-5 h-5 accent-primary-500 shrink-0"
                      aria-label={`${r.english} 넣기`}
                    />
                    <input
                      type="text"
                      value={r.english}
                      onChange={(e) => updateRow(i, { english: e.target.value, korean: r.auto ? "" : r.korean, auto: false })}
                      onBlur={() => {
                        if (r.english.trim() && !r.korean.trim() && rows) void fillMeanings(rows);
                      }}
                      className="input-field text-sm !py-2 flex-1 min-w-0"
                      aria-label={`${i + 1}번 영어`}
                    />
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={r.korean}
                        onChange={(e) => updateRow(i, { korean: e.target.value, auto: false })}
                        placeholder={meaningLoading && !r.korean ? "뜻 찾는 중..." : "뜻"}
                        className={`input-field text-sm !py-2 ${r.auto ? "pr-10" : ""}`}
                        aria-label={`${i + 1}번 뜻`}
                      />
                      {r.auto && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary-500 bg-primary-50 px-1 rounded">
                          자동
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {meaningNote && <p className="text-xs text-orange-600 mt-2">{meaningNote}</p>}
              <p className="text-xs text-gray-400 mt-2">&ldquo;자동&rdquo; 표시는 뜻을 자동으로 찾아 넣은 칸이에요. 넣은 뒤에도 고칠 수 있어요.</p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={retake}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-500 text-white rounded-xl font-bold hover:bg-gray-600 transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                  다시 찍기
                </button>
                <button
                  onClick={addSelected}
                  disabled={selectedCount === 0}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 transition-colors disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                  {selectedCount}개 넣기
                </button>
              </div>
            </div>
          ) : (
            // ---------- 사진 찍기·고르기 단계 ----------
            <>
              <div className="relative aspect-[4/3] bg-gray-900 rounded-2xl overflow-hidden mb-4">
                {capturedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capturedImage} alt="찍은 사진" className="w-full h-full object-contain" />
                ) : stream ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <Camera className="w-16 h-16 mb-2" />
                    <p className="text-sm">카메라로 찍거나 갤러리에서 사진을 고르세요</p>
                  </div>
                )}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-10 h-10 animate-spin mb-2" />
                    <p className="text-sm font-medium">
                      {status}
                      {status === "글자 읽는 중" ? ` ${progress}%` : "..."}
                    </p>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" aria-label="사진 파일" />

              <div className="grid grid-cols-2 gap-3">
                {!stream && !capturedImage && !isProcessing && (
                  <>
                    <button
                      onClick={() => startCamera(facingMode)}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                      카메라 시작
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors"
                    >
                      <ImageIcon className="w-5 h-5" />
                      갤러리/파일
                    </button>
                  </>
                )}
                {stream && !isProcessing && (
                  <>
                    <button
                      onClick={capturePhoto}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                      사진 촬영
                    </button>
                    <button
                      onClick={toggleCamera}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-500 text-white rounded-xl font-bold hover:bg-gray-600 transition-colors"
                    >
                      <RotateCcw className="w-5 h-5" />
                      카메라 전환
                    </button>
                  </>
                )}
                {capturedImage && !isProcessing && (
                  <>
                    <button
                      onClick={retake}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-gray-500 text-white rounded-xl font-bold hover:bg-gray-600 transition-colors"
                    >
                      <RotateCcw className="w-5 h-5" />
                      다시 찍기
                    </button>
                    <button
                      onClick={runOcr}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 transition-colors"
                    >
                      <Check className="w-5 h-5" />
                      단어 인식하기
                    </button>
                  </>
                )}
              </div>

              <label className="flex items-start gap-2 mt-4 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={readKorean}
                  onChange={(e) => setReadKorean(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 mt-0.5 accent-primary-500"
                />
                <span>
                  책에 적힌 한국어 뜻도 읽기
                  <span className="block text-xs text-gray-400">
                    끄면 영어만 읽고 뜻은 자동으로 채워요 (더 빠르고 정확해요)
                  </span>
                </span>
              </label>

              <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-600">
                <p className="font-bold mb-1">💡 잘 찍는 방법</p>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>단어 목록 부분이 화면을 가득 채우게, 글자가 반듯하게 찍어주세요</li>
                  <li>그림자 없이 밝은 곳에서 찍으면 더 정확해요</li>
                  <li>인식한 단어는 넣기 전에 확인하고 고칠 수 있어요</li>
                  <li>사진은 이 기기 안에서만 처리하고 서버로 보내지 않아요</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
