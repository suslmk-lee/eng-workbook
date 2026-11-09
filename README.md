# 영어 단어 학습 프로그램

초등학생을 위한 영어 단어 학습 웹 앱입니다.
학부모가 매일 숙제 단어를 등록하면, 학생이 7가지 학습 모듈로 단어를 외울 수 있습니다.

## 계정 구조

- **학부모만 계정**이 있습니다 (이메일 가입). 가입하면 가족이 자동으로 만들어집니다.
- **아이는 계정이 아니라 가족 안의 프로필**입니다. 부모가 로그인한 기기에서
  "누가 공부하나요?" 화면(`/profiles`)에서 아이 이름을 고르면 **자녀 모드**로 학습합니다.
- 자녀 모드에서 부모 화면으로 돌아갈 때는 **부모 PIN(숫자 4자리)**을 입력합니다.
  PIN을 잊으면 계정 비밀번호를 다시 입력하고 새로 정할 수 있습니다.
- 가족 단위라서 나중에 엄마·아빠 두 계정이 한 가족을 함께 관리할 수 있습니다(초대 기능 예정).

## 기능

### 오늘의 학습 (자동)
부모가 단어를 넣지 않아도, 아이가 앱을 열면 그날 할 학습을 자동으로 만들어 줍니다.
- **새 단어:** 아이 수준에 맞춰 공용 단어 사전(500단어, 5레벨×100, 뜻·예문 포함)에서 순서대로 (하루 기본 5개, 부모가 3~10개로 조절)
- **복습:** 단어마다 망각곡선 간격(1→2→4→7→15→30→60일)으로 다시 내줌. 틀린 단어는 다음 날, 최근 틀린 단어부터
- **숙제가 있는 날**은 새 단어 없이 복습만. 숙제와 오늘의 학습 중 골라서 공부하고, 지난 숙제도 다시 할 수 있음
- **자동 조절:** 복습이 20개 넘게 밀리면 새 단어 −3, 최근 7일 정답률 60% 미만이면 −2, 90% 이상이면 +2 (이유를 화면에 표시)
- 같은 단어는 숙제·자동 학습 어디서 나와도 아이별로 하나로 관리 (`child_word_progress`, 학습 기록 저장 시 DB가 자동 갱신)

### 레벨 테스트
- 레벨마다 4문제(영어 → 뜻 고르기, "모르겠어요" 가능). 3문제 이상 맞히면 다음 레벨, 아니면 거기서 끝 (최대 20문제)
- 결과 레벨부터 새 단어를 내고, 맞힌 단어는 아는 단어로 표시해 4일 뒤 복습으로만 확인
- 부모 화면에서 결과를 초기화(다시 하기)할 수 있고, 학년을 직접 바꾸면 학년 기준으로 돌아감

### 주제별 단어장
- 아이: 동물·음식·학교 등 31개 주제 중 골라 공부 (안 배운 단어 먼저, 최대 10개)
- 부모: 숙제 등록 화면에서 주제를 고르면 아이가 안 배운 단어로 빈칸을 채워 줌 (입력 부담 감소)

### 학부모 페이지
- 자녀 프로필 추가·이름 변경·삭제, 부모 PIN 설정
- 자녀별 오늘의 학습 설정 (켜기/끄기, 학년, 하루 새 단어 수), 레벨 테스트 결과 확인·초기화
- 날짜별 단어 10개 등록 (숙제, 카메라 인식·단어장에서 채우기)
- 학습 현황 대시보드 (정답률, 모듈별 통계, 단어 학습 상태·자주 틀리는 단어)
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
- 별/트로피 보상 시스템
- 플래시카드 뒷면에 예문과 예문 발음 듣기 (사전에 있는 단어)

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

## 로컬 개발 (로컬 Supabase)

내 컴퓨터에 Supabase(DB·로그인·API)를 띄워 운영 DB를 건드리지 않고 개발·시험합니다.
[Docker Desktop](https://www.docker.com/products/docker-desktop/)이 설치·실행돼 있어야 합니다.

```bash
npm run db:start    # 로컬 Supabase 시작 (처음엔 이미지 내려받느라 몇 분). DB 구조 + 테스트 데이터 자동 적용
npm run dev:local   # 로컬 Supabase에 붙여 앱 실행 → http://localhost:3000
```

- 테스트 계정: `mom@test.local` / `pass1234` (엄마), `dad@test.local` / `pass1234` (아빠, 같은 가족)
- DB 데이터는 Studio(http://127.0.0.1:54323)에서 표로 볼 수 있습니다.
- `npm run dev`는 지금처럼 `.env.local`(운영 Supabase)을 그대로 씁니다.

| 명령 | 하는 일 |
|---|---|
| `npm run db:start` / `db:stop` | 로컬 Supabase 켜기 / 끄기 (꺼도 데이터는 남음) |
| `npm run db:reset` | DB를 비우고 마이그레이션 + 테스트 데이터를 처음부터 다시 적용 |
| `npm run db:status` | 주소·키 확인 |
| `npm run db:new <이름>` | 새 마이그레이션 파일 만들기 (`supabase/migrations/`) |

### 폴더 구조

```
supabase/
├─ config.toml        로컬 Supabase 설정 (안 쓰는 realtime·edge functions·로그 분석은 꺼 둠)
├─ migrations/        DB 변경 이력. 파일명 앞 숫자(시각) 순서로 적용
│  ├─ 20260530181907_initial_schema.sql   단어·학습 기록 테이블
│  ├─ 20260530181908_auth.sql             학부모/학생 계정 (옛 구조)
│  ├─ 20260602074419_tts_storage.sql      발음 mp3 저장 버킷
│  ├─ 20261109074851_security.sql         보안 정책 정비 (0단계)
│  ├─ 20261109211038_family.sql           학부모 계정 + 자녀 프로필 (2단계)
│  ├─ 20261110100000_dictionary.sql       공용 단어 사전 300단어 (뜻·예문·레벨)
│  ├─ 20261110100100_daily_lesson.sql     오늘의 학습·자녀 학습 설정·단어별 학습 상태
│  ├─ 20261110200000_dictionary_more.sql  사전 확장 +200단어 (총 500)
│  └─ 20261110200100_lesson_v2.sql        레벨 테스트·자동 조절·주제별 단어장
├─ rollback/          비상용 되돌리기 SQL (자동 적용되지 않음)
└─ seed.sql           로컬 테스트 데이터 (운영에서는 실행 금지)
```

DB를 바꿀 때는 `npm run db:new 설명`으로 새 파일을 만들어 SQL을 쓰고, `npm run db:reset`으로 로컬에서 확인한 뒤 운영에 적용합니다.

## 운영 Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. `.env.local.example`을 `.env.local`로 복사 후 키 입력
3. Supabase SQL Editor에서 `supabase/migrations/`의 파일을 **이름 순서대로** 실행

```bash
cp .env.local.example .env.local
# .env.local 파일에 Supabase URL과 ANON KEY 입력
```

**운영 DB 적용 방식:** 새 마이그레이션은 새 컬럼·테이블·함수만 추가해 이전 코드와 호환되도록 만들고,
**SQL을 먼저 실행한 뒤 PR을 머지**합니다 (중단 없음). 어디까지 적용했는지는 SQL Editor에서
`SELECT to_regclass('public.dictionary_words'), (SELECT count(*) FROM dictionary_words)` 등으로 확인할 수 있습니다.

> 운영 DB는 지금까지 SQL Editor로 직접 적용해 왔기 때문에, 나중에 `supabase db push`로 바꾸려면
> 먼저 `supabase migration repair --status applied <버전>`으로 이미 적용된 파일을 표시해야 합니다.

## 음성 발음 (TTS) 설정

브라우저 내장 음성은 기기마다 품질이 달라, OpenAI TTS로 발음 mp3를 생성합니다.
키 설정에 따라 세 가지 모드로 동작합니다:

| 모드 | 필요 키 | 동작 |
|---|---|---|
| Storage 캐싱 (권장) | `OPENAI_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | 단어당 1회만 OpenAI 호출, 이후 CDN 재생 |
| 캐싱 없음 | `OPENAI_API_KEY`만 | 재생할 때마다 OpenAI 호출 (세션 내 반복 재생은 메모리 캐시) |
| 키 없음 | 없음 | 브라우저 내장 음성(Web Speech)으로 자동 폴백 |

캐싱 모드 설정:

1. `supabase/migrations/20260602074419_tts_storage.sql`을 Supabase SQL Editor에서 실행 (public `tts` 버킷 생성)
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
