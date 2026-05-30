"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, RotateCcw, Check, Scan, Loader2 } from "lucide-react";
import Tesseract from "tesseract.js";

interface CameraOcrProps {
  onWordsDetected: (words: { english: string; korean: string }[]) => void;
  onClose: () => void;
}

export default function CameraOcr({ onWordsDetected, onClose }: CameraOcrProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // 카메라 시작
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.error("Video play error:", playErr);
        }
      }
    } catch (err) {
      setError("카메라 접근이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.");
      console.error("Camera error:", err);
    }
  }, [facingMode]);

  // 카메라 중지
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // 사진 촬영
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(imageData);
    stopCamera();
  }, [stopCamera]);

  // 파일에서 이미지 선택
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // OCR 실행
  const runOcr = useCallback(async () => {
    if (!capturedImage) return;

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const result = await Tesseract.recognize(
        capturedImage,
        "eng+kor", // 영어 + 한국어
        {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round(m.progress * 100));
            }
          },
        }
      );

      const extractedText = result.data.text;
      const parsedWords = parseWords(extractedText);

      if (parsedWords.length === 0) {
        setError("인식된 단어가 없습니다. 더 선명한 이미지로 다시 시도해주세요.");
      } else {
        onWordsDetected(parsedWords);
      }
    } catch (err) {
      setError("텍스트 인식 중 오류가 발생했습니다. 다시 시도해주세요.");
      console.error("OCR error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, onWordsDetected]);

  // 텍스트 파싱 (영어-한국어 쌍 추출)
  const parseWords = (text: string): { english: string; korean: string }[] => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const words: { english: string; korean: string }[] = [];

    // 패턴 1: "영어 - 한국어" 또는 "영어: 한국어" 형식
    const separatorPattern = /^([a-zA-Z\s'-]+)[\s]*[-:\\u2013\u2014][\s]*(.+)$/;

    // 패턴 2: 번호 + 영어 + 한국어 (예: "1. apple 사과")
    const numberedPattern = /^\d+[.\s)*]+\s*([a-zA-Z\s'-]+)[\s]+(.+)$/;

    // 패턴 3: 탭이나 여러 공백으로 구분된 형식
    const tabPattern = /^([a-zA-Z\s'-]+)\s{2,}(.+)$/;

    for (const line of lines) {
      let match: RegExpMatchArray | null = null;
      let english = "";
      let korean = "";

      if ((match = line.match(separatorPattern))) {
        english = match[1].trim();
        korean = match[2].trim();
      } else if ((match = line.match(numberedPattern))) {
        english = match[1].trim();
        korean = match[2].trim();
      } else if ((match = line.match(tabPattern))) {
        english = match[1].trim();
        korean = match[2].trim();
      }

      // 한국어 유효성 검사 (한글 포함 여부)
      const hasKorean = /[\u3131-\u318E\uAC00-\uD7A3]/.test(korean);
      // 영어 유효성 검사
      const hasEnglish = /^[a-zA-Z\s'-]+$/.test(english);

      if (english && korean && hasEnglish && (hasKorean || korean.length > 0)) {
        words.push({ english, korean });
      }
    }

    // 중복 제거
    return words.filter(
      (word, index, self) =>
        index === self.findIndex((w) => w.english === word.english && w.korean === word.korean)
    );
  };

  // 다시 촬영
  const retake = useCallback(() => {
    setCapturedImage(null);
    setError(null);
    setProgress(0);
    startCamera();
  }, [startCamera]);

  // 모달 닫기
  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // 카메라 전환
  const toggleCamera = useCallback(() => {
    stopCamera();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    setTimeout(() => startCamera(), 100);
  }, [stopCamera, startCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Scan className="w-5 h-5" />
            <span className="font-bold">카메라로 단어 등록</span>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
          {/* 에러 메시지 */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* 이미지 미리보기 / 카메라 뷰 */}
          <div className="relative aspect-[4/3] bg-gray-900 rounded-2xl overflow-hidden mb-4">
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-contain"
              />
            ) : stream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <Camera className="w-16 h-16 mb-2" />
                <p className="text-sm">카메라를 시작하거나 갤러리에서 선택하세요</p>
              </div>
            )}

            {/* 처리 중 오버레이 */}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">
                <Loader2 className="w-10 h-10 animate-spin mb-2" />
                <p className="text-sm font-medium">텍스트 인식 중... {progress}%</p>
              </div>
            )}
          </div>

          {/* 캔버스 (숨김) */}
          <canvas ref={canvasRef} className="hidden" />

          {/* 파일 입력 (숨김) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 액션 버튼들 */}
          <div className="grid grid-cols-2 gap-3">
            {!stream && !capturedImage && !isProcessing && (
              <>
                <button
                  onClick={startCamera}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  카메라 시작
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors"
                >
                  <Scan className="w-5 h-5" />
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
                  다시 촬영
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

          {/* 도움말 */}
          <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-600">
            <p className="font-bold mb-1">💡 인식 팁:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>영어 단어와 한국어 뜻이 함께 있는 교재를 비춰주세요</li>
              <li>"apple - 사과" 또는 "1. apple 사과" 형식이 잘 인식됩니다</li>
              <li>밝은 곳에서 선명하게 찍을수록 정확도가 높아집니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
