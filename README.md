# 영어 단어 학습 프로그램

초등학생을 위한 영어 단어 학습 웹 앱입니다.
학부모가 매일 숙제 단어를 등록하면, 학생이 7가지 학습 모듈로 단어를 외울 수 있습니다.

## 기능

### 학부모 페이지
- 날짜별 단어 10개 등록
- 학습 현황 대시보드 (정답률, 모듈별 통계)
- 등록 이력 관리 및 단어별 정답률 확인

### 학생 페이지 (7가지 학습 모듈)
1. **플래시카드** - 카드 넘기며 암기
2. **4지선다 퀴즈** - 영어↔한국어 선택
3. **매칭 게임** - 영어-한국어 짝 맞추기
4. **스펠링 입력** - 뜻 보고 영어 타이핑
5. **단어 스크램블** - 섞인 글자 재배열
6. **듣고 쓰기** - TTS 발음 듣고 입력
7. **스피드 퀴즈** - 60초 제한 시간 퀴즈

### 추가 기능
- 에빙하우스 망각곡선 기반 복습 시스템
- 별/트로피 보상 시스템
- 오답 자동 추적

## 기술 스택
- **Next.js 14** (App Router)
- **React 18** + **TypeScript**
- **TailwindCSS** (스타일링)
- **Supabase** (DB + API)
- **Web Speech API** (TTS 발음)
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
