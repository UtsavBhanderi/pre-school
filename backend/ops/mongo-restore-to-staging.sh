#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

for command_name in mongorestore age sha256sum python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required tool is missing: %s\n' "$command_name" >&2
    exit 1
  }
done

: "${MONGO_RESTORE_TARGET_URI:?Set MONGO_RESTORE_TARGET_URI to a dedicated restore-test database.}"
: "${BACKUP_AGE_IDENTITY_FILE:?Set BACKUP_AGE_IDENTITY_FILE to the private age identity for this backup.}"
: "${RESTORE_TARGET_ENV:?Set RESTORE_TARGET_ENV=staging after confirming the destination.}"
: "${RESTORE_CONFIRM_TARGET_DATABASE:?Set this to the exact target database name as a second confirmation.}"
: "${RESTORE_APPROVED_BY:?Record the authorized approver for the restore rehearsal.}"
: "${RESTORE_CHANGE_TICKET:?Record the approved change or rehearsal ticket.}"

[[ "$RESTORE_TARGET_ENV" == "staging" ]] || {
  printf 'Refusing restore: RESTORE_TARGET_ENV must be exactly "staging".\n' >&2
  exit 2
}
[[ -r "$BACKUP_AGE_IDENTITY_FILE" ]] || {
  printf 'The age identity file is missing or unreadable.\n' >&2
  exit 2
}
[[ -n "${1:-}" ]] || {
  printf 'Usage: %s /path/to/database.archive.gz.age\n' "$0" >&2
  exit 2
}
archive_path="$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
[[ -f "$archive_path" && -s "$archive_path" ]] || {
  printf 'Backup archive is missing or empty.\n' >&2
  exit 2
}
metadata_path="${archive_path}.meta.json"
[[ -f "$metadata_path" && -s "$metadata_path" ]] || {
  printf 'The matching metadata file is missing. Refusing restore.\n' >&2
  exit 2
}

source_database="$(python3 - "$metadata_path" "$(basename -- "$archive_path")" <<'PY'
import json
import re
import sys

path, expected_archive = sys.argv[1:]
try:
    with open(path, encoding='utf-8') as handle:
        metadata = json.load(handle)
    if metadata.get('format') != 'preschool-mongodb-backup-v1':
        raise ValueError('unsupported backup metadata format')
    if metadata.get('archive') != expected_archive:
        raise ValueError('metadata does not describe the selected archive')
    if metadata.get('encryption') != 'age':
        raise ValueError('backup is not marked as age-encrypted')
    name = metadata.get('database', '')
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,63}', name):
        raise ValueError('invalid source database name in metadata')
    if name.lower() in {'admin', 'config', 'local'}:
        raise ValueError('system databases cannot be restored by this tool')
    digest = metadata.get('sha256', '')
    if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('invalid backup checksum in metadata')
    print(name)
except Exception as error:
    print('Invalid backup metadata: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
)" || exit 1

source_endpoint_sha256="$(python3 - "$metadata_path" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1], encoding='utf-8') as handle:
        value = json.load(handle).get('sourceEndpointSha256', '')
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value):
        raise ValueError('missing or invalid source endpoint fingerprint')
    print(value)
except Exception as error:
    print('Invalid backup endpoint metadata: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
)" || exit 1

expected_sha256="$(python3 - "$metadata_path" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    print(json.load(handle)['sha256'])
PY
)" || exit 1
actual_sha256="$(sha256sum "$archive_path" | awk '{print $1}')"
[[ "$actual_sha256" == "$expected_sha256" ]] || {
  printf 'Backup checksum mismatch. Refusing restore.\n' >&2
  exit 2
}

target_database="$(python3 - "$MONGO_RESTORE_TARGET_URI" "$source_database" "$RESTORE_CONFIRM_TARGET_DATABASE" "$source_endpoint_sha256" <<'PY'
import hashlib
import re
import sys
from urllib.parse import unquote, urlsplit

uri, source_database, confirmation, source_fingerprint = sys.argv[1:]
try:
    parsed = urlsplit(uri)
    if parsed.scheme not in ('mongodb', 'mongodb+srv'):
        raise ValueError('unsupported destination URI scheme')
    database = unquote(parsed.path.lstrip('/').split('/', 1)[0])
    if not re.fullmatch(r'restore_test_[A-Za-z0-9_-]{1,50}', database):
        raise ValueError('destination database name must start with restore_test_')
    if database == source_database:
        raise ValueError('destination database must differ from the source database')
    if database != confirmation:
        raise ValueError('RESTORE_CONFIRM_TARGET_DATABASE does not match the URI database')
    if parsed.hostname is None:
        raise ValueError('destination URI must include a hostname')
    authority = parsed.netloc.rsplit('@', 1)[-1].lower()
    endpoint = ','.join(sorted(authority.split(',')))
    target_fingerprint = hashlib.sha256(endpoint.encode('utf-8')).hexdigest()
    if target_fingerprint == source_fingerprint:
        raise ValueError('restore target must be a different MongoDB deployment from the source backup')
    print(database)
except Exception as error:
    print('Unsafe restore target: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
)" || exit 1

if [[ ${#RESTORE_APPROVED_BY} -lt 2 || ${#RESTORE_CHANGE_TICKET} -lt 3 ]]; then
  printf 'Approver name and change-ticket reference must be provided.\n' >&2
  exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/preschool-restore.XXXXXX")"
chmod 700 -- "$temp_dir"
cleanup() { rm -rf -- "$temp_dir"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

target_config="$temp_dir/mongorestore.yml"
plain_archive="$temp_dir/$source_database.archive.gz"
python3 - "$target_config" "$MONGO_RESTORE_TARGET_URI" <<'PY'
import json
import os
import sys
path, uri = sys.argv[1], sys.argv[2]
with open(path, 'w', encoding='utf-8') as handle:
    handle.write('uri: ' + json.dumps(uri) + '\n')
os.chmod(path, 0o600)
PY

printf 'Decrypting backup for the approved staging restore...\n'
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$plain_archive" "$archive_path"
[[ -s "$plain_archive" ]] || { printf 'Decrypted archive is empty; refusing restore.\n' >&2; exit 1; }

printf 'Restoring source database "%s" into test database "%s"...\n' "$source_database" "$target_database"
printf 'Approved by: %s | Change ticket: %s\n' "$RESTORE_APPROVED_BY" "$RESTORE_CHANGE_TICKET"
mongorestore \
  --config "$target_config" \
  --archive="$plain_archive" \
  --gzip \
  --drop \
  --objcheck \
  --stopOnError \
  --nsFrom="${source_database}.*" \
  --nsTo="${target_database}.*"

printf 'Verifying restored records and tenant-isolation indexes...\n'
MONGO_RESTORE_TARGET_URI="$MONGO_RESTORE_TARGET_URI" node "$SCRIPT_DIR/verify-restore.js"
printf 'Restore rehearsal completed. This does not authorize a production restore or public SaaS signup.\n'
