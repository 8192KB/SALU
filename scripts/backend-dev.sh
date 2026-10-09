#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$project_root/.env" ]]; then
  set -a
  source "$project_root/.env"
  set +a
fi
for name in SALU_DB_PASSWORD SALU_PHOTO_ROOT; do
  if [[ -z "${!name:-}" || "${!name}" == CHANGE_ME* ]]; then
    printf '설정 누락: %s — .env 또는 환경변수에서 값을 지정하세요.\n' "$name" >&2
    exit 1
  fi
done
cd "$project_root/backend"
exec ./mvnw spring-boot:run
