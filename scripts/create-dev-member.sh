#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$project_root/.env" ]]; then
  set -a
  source "$project_root/.env"
  set +a
fi
: "${SALU_DB_PASSWORD:?설정 누락: SALU_DB_PASSWORD}"
artifact="$project_root/backend/target/salu-backend-0.1.0-SNAPSHOT.jar"
[[ -f "$artifact" ]] || { printf '실행 준비: 백엔드 빌드 필요\n' >&2; exit 1; }
tool_home="$(mktemp -d)"
trap 'rm -rf -- "$tool_home"' EXIT
python3 - "$artifact" "$tool_home" <<'EXTRACT'
import sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
    for name in z.namelist():
        if name.startswith(('BOOT-INF/lib/spring-security-crypto-', 'BOOT-INF/lib/spring-jcl-', 'BOOT-INF/lib/commons-logging-', 'BOOT-INF/lib/mysql-connector-j-')) and name.endswith('.jar'):
            (Path(sys.argv[2]) / Path(name).name).write_bytes(z.read(name))
EXTRACT
java --class-path "$tool_home/*" "$project_root/scripts/CreateDevMember.java" "$@"
