#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$project_root/.env"
set +a
cd "$project_root/backend"
./mvnw -B -ntp test-compile dependency:build-classpath -Dmdep.includeScope=test -Dmdep.outputFile=/tmp/salu-storage-classpath >/tmp/salu-storage-compile.log 2>&1
exec java -cp "target/test-classes:target/classes:$(cat /tmp/salu-storage-classpath)" verification.salu.StorageBrowserServer
