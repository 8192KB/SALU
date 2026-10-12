#!/usr/bin/env python3
"""Create the local development key without displaying or replacing any secret."""
import base64
import json
import os
from pathlib import Path

project = Path(__file__).resolve().parent.parent
key_file = project / '.env.backup-keys.json'
if not key_file.exists():
    fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'v1': base64.b64encode(os.urandom(32)).decode('ascii')}, stream)
env_file = project / '.env'
if not env_file.exists():
    raise SystemExit('설정 누락: .env — 먼저 기존 개발 환경을 준비하세요.')
if not any(line.startswith('SALU_BACKUP_KEY_FILE=') for line in env_file.read_text().splitlines()):
    with env_file.open('a') as stream:
        stream.write(f"\nSALU_BACKUP_KEY_FILE='{key_file}'\nSALU_BACKUP_KEY_ID=v1\n")
print('개발 암호화 키: 준비 완료 — 값 출력·기존 키 변경 없음')
