-- =============================================
-- 클라우드 TTS 캐싱용 Storage 버킷
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- public 버킷 생성 (읽기는 CDN public URL로 누구나 가능, 쓰기는 service_role만)
insert into storage.buckets (id, name, public)
values ('tts', 'tts', true)
on conflict (id) do nothing;

-- 참고:
--  - 업로드는 API 라우트(/api/tts)에서 SUPABASE_SERVICE_ROLE_KEY로만 수행됩니다.
--  - 재생은 public URL(.../storage/v1/object/public/tts/...)로 직접 이루어지므로
--    별도 SELECT 정책이 필요 없습니다.
