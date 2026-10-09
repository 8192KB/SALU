#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$project_root/.env" ]]; then
  set -a
  source "$project_root/.env"
  set +a
fi
runtime_home="${SALU_RUNTIME_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/salu/runtime}"
SALU_MYSQL_BASEDIR="${SALU_MYSQL_BASEDIR:-$runtime_home/mysql-8.4.11-linux-glibc2.28-x86_64-minimal}"
export LD_LIBRARY_PATH="$runtime_home/libaio/lib:$runtime_home/compat-lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mysql_home="${SALU_MYSQL_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/salu/mysql}"
mysql_socket="$mysql_home/mysql.sock"
mysql_client="$SALU_MYSQL_BASEDIR/bin/mysql"
mysql_admin="$SALU_MYSQL_BASEDIR/bin/mysqladmin"
mysql_server="$SALU_MYSQL_BASEDIR/bin/mysqld"
if [[ "$mysql_home" != /* || "$SALU_MYSQL_BASEDIR" != /* ]]; then
  printf '설정 오류: MySQL 저장 경로와 바이너리 경로는 절대 경로여야 합니다.\n' >&2
  exit 1
fi
if [[ ! -x "$mysql_server" ]]; then
  printf 'DB 실행 파일 없음: README의 로컬 MySQL 설치 경로를 확인하세요.\n' >&2
  exit 1
fi
server_args=(--no-defaults "--basedir=$SALU_MYSQL_BASEDIR" "--datadir=$mysql_home/data"
  "--socket=$mysql_socket" "--pid-file=$mysql_home/mysql.pid" "--log-error=$mysql_home/mysql.log"
  --mysqlx=OFF)

case "${1:-status}" in
  init)
    for name in SALU_DB_PASSWORD SALU_MYSQL_ROOT_PASSWORD; do
      if [[ -z "${!name:-}" || "${!name}" == CHANGE_ME* ]]; then
        printf '설정 누락: %s\n' "$name" >&2
        exit 1
      fi
    done
    if [[ -e "$mysql_home/data" ]]; then
      printf 'DB 초기화: 기존 datadir 보존 — 새 저장 경로를 지정하거나 start를 사용하세요.\n' >&2
      exit 1
    fi
    mkdir -p "$mysql_home"
    chmod 700 "$mysql_home"
    "$mysql_server" --no-defaults "--basedir=$SALU_MYSQL_BASEDIR" "--datadir=$mysql_home/data" --initialize-insecure >"$mysql_home/initialize.log" 2>&1
    bootstrap_file="$(mktemp "$mysql_home/bootstrap.XXXXXX.sql")"
    trap 'rm -f -- "$bootstrap_file"' EXIT
    python3 - "$bootstrap_file" <<'PY'
import os, sys
def quote(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"
with open(sys.argv[1], 'w') as f:
    f.write("ALTER USER 'root'@'localhost' IDENTIFIED BY " + quote(os.environ['SALU_MYSQL_ROOT_PASSWORD']) + ";\n")
    f.write("CREATE DATABASE salu_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n")
    f.write("CREATE USER 'salu_app'@'127.0.0.1' IDENTIFIED BY " + quote(os.environ['SALU_DB_PASSWORD']) + ";\n")
    f.write("GRANT ALL PRIVILEGES ON salu_dev.* TO 'salu_app'@'127.0.0.1';\n")
PY
    "$mysql_server" "${server_args[@]}" --daemonize --skip-networking "--init-file=$bootstrap_file"
    MYSQL_PWD="$SALU_MYSQL_ROOT_PASSWORD" "$mysql_admin" --no-defaults --protocol=SOCKET --socket="$mysql_socket" -u root shutdown
    printf 'DB 초기화: salu_dev·전용 사용자 생성 — 기존 DB와 분리\n'
    ;;
  start)
    if [[ ! -d "$mysql_home/data/mysql" ]]; then
      printf 'DB 시작 실패: scripts/mysql-local.sh init을 먼저 실행하세요.\n' >&2
      exit 1
    fi
    "$mysql_server" "${server_args[@]}" --daemonize --bind-address=127.0.0.1 "--port=${SALU_DB_PORT:-3307}"
    printf 'DB 실행: 127.0.0.1:%s — %s\n' "${SALU_DB_PORT:-3307}" "$mysql_home/data"
    ;;
  stop)
    : "${SALU_MYSQL_ROOT_PASSWORD:?SALU_MYSQL_ROOT_PASSWORD를 지정하세요.}"
    MYSQL_PWD="$SALU_MYSQL_ROOT_PASSWORD" "$mysql_admin" --no-defaults --protocol=SOCKET --socket="$mysql_socket" -u root shutdown
    printf 'DB 종료: 데이터 보존\n'
    ;;
  status)
    : "${SALU_DB_PASSWORD:?SALU_DB_PASSWORD를 지정하세요.}"
    MYSQL_PWD="$SALU_DB_PASSWORD" "$mysql_client" --no-defaults --protocol=TCP -h 127.0.0.1 -P "${SALU_DB_PORT:-3307}" -u salu_app -D salu_dev -e 'SELECT VERSION(), DATABASE();'
    ;;
  *) printf '사용법: scripts/mysql-local.sh {init|start|stop|status}\n' >&2; exit 2 ;;
esac
