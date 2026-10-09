#!/usr/bin/env python3
import os
from pathlib import Path
import secrets

root = Path(__file__).resolve().parent.parent
destination = root / ".env"
content = (root / ".env.example").read_text()
content = content.replace("CHANGE_ME_APP_PASSWORD", secrets.token_urlsafe(32))
content = content.replace("CHANGE_ME_ROOT_PASSWORD", secrets.token_urlsafe(32))
content = content.replace("/home/chuwe/.local/share/salu/photos", str(Path.home() / ".local/share/salu/photos"))
try:
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit("환경 설정: 기존 .env 보존 — 필요한 값은 직접 수정하세요.")
with os.fdopen(descriptor, "w") as stream:
    stream.write(content)
print("환경 설정: .env 생성 — DB 비밀번호 자동 생성, 파일 권한 600")
