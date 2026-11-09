#!/bin/sh
# 로컬 Supabase에 붙여 개발 서버 실행 (npm run dev:local)
# .env.local(운영 값)보다 여기서 넘기는 값이 우선한다. OPENAI_API_KEY 등 나머지는 .env.local 값을 그대로 쓴다.
set -e
cd "$(dirname "$0")/.."

STATUS=$(sh scripts/supabase.sh status -o env 2>/dev/null | grep -E '^[A-Z_]+=".*"$') || true
if [ -z "$STATUS" ]; then
  echo "로컬 Supabase가 꺼져 있어요. 먼저 npm run db:start 를 실행해 주세요." >&2
  exit 1
fi
eval "$STATUS"

echo "로컬 Supabase($API_URL)에 연결합니다. 앱: http://localhost:3000  DB 화면(Studio): $STUDIO_URL"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  exec npx next dev -p 3000
