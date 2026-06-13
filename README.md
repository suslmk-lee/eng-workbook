# 영어 단어 학습 프로그램

초등학생을 위한 영어 단어 학습 웹 앱입니다.
학부모가 매일 숙제 단어를 등록하면, 학생이 7가지 학습 모듈로 단어를 외울 수 있습니다.

## 기능

### 학부모 페이지
- 날짜별 단어 10개 등록
- 학습 현황 대시보드 (정답률, 모듈별 통계)
- 등록 이력 관리 및 단어별 정답률 확인

### 학생 페이지 (9가지 학습 모듈)
1. **플래시카드** - 카드 넘기며 암기
2. **4지선다 퀴즈** - 영어↔한국어 선택
3. **매칭 게임** - 영어-한국어 짝 맞추기
4. **스펠링 입력** - 뜻 보고 영어 타이핑
5. **단어 스크램블** - 섞인 글자 재배열
6. **듣고 쓰기** - TTS 발음 듣고 입력
7. **스피드 퀴즈** - 60초 제한 시간 퀴즈
8. **발음 챌린지** - 마이크에 대고 발음하면 음성 인식으로 판정
9. **몬스터 배틀** - 정답으로 몬스터를 공격하는 RPG 퀴즈

### 추가 기능
- 에빙하우스 망각곡선 기반 복습 시스템
- 별/트로피 보상 시스템
- 오답 자동 추적

## 기술 스택
- **Next.js 14** (App Router)
- **React 18** + **TypeScript**
- **TailwindCSS** (스타일링)
- **Supabase** (DB + API + Storage)
- **OpenAI TTS** (고품질 발음, Storage 캐싱) + **Web Speech API** (폴백)
- **Lucide React** (아이콘)
- **Framer Motion** (애니메이션)

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버
npm run dev
```

## Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. `.env.local.example`을 `.env.local`로 복사 후 키 입력
3. `src/lib/supabase-schema.sql` 내용을 Supabase SQL Editor에서 실행

```bash
cp .env.local.example .env.local
# .env.local 파일에 Supabase URL과 ANON KEY 입력
```

## 음성 발음 (TTS) 설정

브라우저 내장 음성은 기기마다 품질이 달라, OpenAI TTS로 발음 mp3를 생성합니다.
키 설정에 따라 세 가지 모드로 동작합니다:

| 모드 | 필요 키 | 동작 |
|---|---|---|
| Storage 캐싱 (권장) | `OPENAI_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | 단어당 1회만 OpenAI 호출, 이후 CDN 재생 |
| 캐싱 없음 | `OPENAI_API_KEY`만 | 재생할 때마다 OpenAI 호출 (세션 내 반복 재생은 메모리 캐시) |
| 키 없음 | 없음 | 브라우저 내장 음성(Web Speech)으로 자동 폴백 |

캐싱 모드 설정:

1. `src/lib/supabase-tts-storage.sql`을 Supabase SQL Editor에서 실행 (public `tts` 버킷 생성)
2. `.env.local`에 키 추가:
   - `OPENAI_API_KEY` — https://platform.openai.com/api-keys
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase 프로젝트 Settings > API > service_role
     (서버 전용. **절대 `NEXT_PUBLIC_` 접두사 금지**)

음성/모델은 `src/lib/tts-config.ts`의 `TTS_VOICE`, `TTS_MODEL`에서 변경할 수 있습니다.

## 배포 (Vercel)

프로덕션: https://eng-workbook.vercel.app

### 자동배포 (GitHub 연동, 권장)

한 번 연동하면 `master`에 push할 때마다 자동으로 빌드·배포됩니다.

1. [Vercel 대시보드](https://vercel.com/dashboard) → `eng-workbook` 프로젝트 → **Settings → Git**
2. **Connect Git Repository** → GitHub → `suslmk-lee/eng-workbook` 선택
3. **Production Branch**가 `master`인지 확인

연동 후에는 배포 명령이 필요 없습니다:

```bash
git push origin master   # → Vercel이 자동으로 빌드·배포
```

### 수동 배포 (Vercel CLI)

GitHub 연동 없이 로컬에서 직접 배포하는 방법입니다.

```bash
# 최초 1회: 로그인 + 프로젝트 연결
npx vercel login          # 이메일 인증
npx vercel link           # 기존 eng-workbook 프로젝트 선택

# 배포
npx vercel --prod         # 프로덕션 배포
npx vercel                # 프리뷰 배포 (테스트용 URL 발급)
```

### 환경 변수

배포 환경의 환경 변수는 `.env.local`과 별개로 Vercel 대시보드에서 설정해야 합니다:
**Settings → Environment Variables**

| 변수 | 필수 여부 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 |
| `OPENAI_API_KEY` | 선택 (고품질 TTS) |
| `SUPABASE_SERVICE_ROLE_KEY` | 선택 (TTS Storage 캐싱) |

환경 변수를 변경하면 **재배포해야 적용**됩니다 (Deployments → 최신 배포 → Redeploy).
현재 적용된 TTS 모드는 메인화면 헤더의 배지로 확인할 수 있습니다.

> 참고: 저장소의 `netlify.toml`은 과거 Netlify 배포 시도의 잔재로, 현재 Vercel 배포에는 사용되지 않습니다.
