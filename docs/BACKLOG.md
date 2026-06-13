# 향후 적용 항목 (Backlog)

## TTS 발음 지연 개선 (2026-06-13 검토, 실측 기반)

현재 production은 `direct` 모드(캐싱 없음)로, 단어 재생마다 3.5~4.2초 소요.
(OpenAI `tts-1-hd` 생성 2.1초 + Vercel 함수 기동/왕복 1.5~2초)

우선순위 순:

1. **Storage 캐싱 활성화** — 코드 변경 없음, 효과 최대
   - Vercel production에 `SUPABASE_SERVICE_ROLE_KEY` 추가 후 재배포
   - Supabase에 `tts` 버킷 없으면 `src/lib/supabase-tts-storage.sql` 실행
   - 단어당 최초 1회만 생성, 이후 CDN 재생(~0.1~0.3초)
   ```bash
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   npx vercel --prod
   ```

2. **프리페치(미리 생성)** — 첫 재생 지연까지 제거
   - 학생이 학습 모듈 진입 시 백그라운드로 단어 10개 TTS를 미리 `/api/tts` 호출
   - 캐싱(1번)과 조합하면 재생이 사실상 항상 즉각적

3. **모델 교체 검토** — 생성 시간 절반 (1·2번 적용 시 우선순위 낮음)
   | 모델 | 생성 시간(실측) | 비고 |
   |---|---|---|
   | `tts-1-hd` (현재) | 2.1초 | 최고 음질 |
   | `gpt-4o-mini-tts` | 1.4초 | 더 저렴, 음질 양호 |
   | `tts-1` | 1.0초 | 단어 단위에선 hd와 차이 미미 |
   - `src/lib/tts-config.ts`의 `TTS_MODEL` 한 줄 변경
   - 주의: 모델 변경 시 캐시 키가 분리되어 기존 캐시는 미사용 상태로 남음

4. ~~direct 모드의 Storage URL 404 헛스윙(~0.3초)~~ — 1번 적용 시 자연 해소
