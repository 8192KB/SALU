#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$project_root/.env" ]]; then
  set -a
  source "$project_root/.env"
  set +a
fi
: "${SALU_DB_PASSWORD:?SALU_DB_PASSWORD를 지정하세요.}"
: "${SALU_MYSQL_ROOT_PASSWORD:?SALU_MYSQL_ROOT_PASSWORD를 지정하세요.}"
runtime_home="${SALU_RUNTIME_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/salu/runtime}"
mysql_home="${SALU_MYSQL_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/salu/mysql}"
mysql_basedir="${SALU_MYSQL_BASEDIR:-$runtime_home/mysql-8.4.11-linux-glibc2.28-x86_64-minimal}"
export LD_LIBRARY_PATH="$runtime_home/libaio/lib:$runtime_home/compat-lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
python3 - <<'PY' | MYSQL_PWD="$SALU_MYSQL_ROOT_PASSWORD" "$mysql_basedir/bin/mysql" --no-defaults --protocol=SOCKET --socket="$mysql_home/mysql.sock" -u root
import os
password = os.environ['SALU_DB_PASSWORD'].replace('\\', '\\\\').replace("'", "\\'")
print("CREATE DATABASE IF NOT EXISTS salu_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;")
print("CREATE USER IF NOT EXISTS 'salu_test'@'127.0.0.1' IDENTIFIED BY '" + password + "';")
print("GRANT ALL PRIVILEGES ON salu_test.* TO 'salu_test'@'127.0.0.1';")
PY
printf '검증 DB: salu_test — 개발 DB와 분리\n'
cd "$project_root/backend"
SALU_RUN_DB_TESTS=true exec ./mvnw -B -ntp verify "$@"
