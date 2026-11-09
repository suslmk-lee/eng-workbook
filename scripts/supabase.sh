#!/bin/sh
# 로컬 Supabase CLI 실행 래퍼 (npm run db:* 에서 사용)
#  - CLI 버전을 고정해 누구나 같은 동작을 얻도록 npx로 실행
#  - Docker Desktop을 설치했지만 docker 명령이 PATH에 없는 Mac을 위해 자동으로 찾아 준다
set -e

SUPABASE_CLI_VERSION="3.0.0"

if ! command -v docker >/dev/null 2>&1; then
  for dir in "$HOME/.docker/bin" "/Applications/Docker.app/Contents/Resources/bin"; do
    if [ -x "$dir/docker" ]; then
      PATH="$dir:$PATH"
      export PATH
      break
    fi
  done
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker를 찾을 수 없어요. Docker Desktop을 설치하고 실행해 주세요." >&2
  exit 1
fi

if [ -z "$DOCKER_HOST" ] && [ ! -S /var/run/docker.sock ] && [ -S "$HOME/.docker/run/docker.sock" ]; then
  DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
  export DOCKER_HOST
fi

exec npx --yes "supabase@$SUPABASE_CLI_VERSION" "$@"
