#!/bin/sh
# Vercel "Ignored Build Step" (vercel.json의 ignoreCommand에서 실행)
#   exit 1 → 빌드 진행 / exit 0 → 빌드 건너뜀
# 운영(master)만 빌드하고, 브랜치 미리보기는 건너뛴다.
# (미리보기 환경에는 Supabase 환경 변수가 없어 빌드가 실패하기 때문)

echo "VERCEL_ENV=${VERCEL_ENV:-(없음)} VERCEL_GIT_COMMIT_REF=${VERCEL_GIT_COMMIT_REF:-(없음)}"

if [ "$VERCEL_ENV" = "production" ] || [ "$VERCEL_GIT_COMMIT_REF" = "master" ]; then
  echo "운영 배포 → 빌드 진행"
  exit 1
fi

echo "미리보기 배포 → 빌드 건너뜀"
exit 0
