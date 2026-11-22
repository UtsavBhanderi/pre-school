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

metadata_values="$(python3 - "$metadata_path" "$(basename -- "$archive_path")" <<'PY'
import json
import re
import sys

path, expected_archive = sys.argv[1:]
try:
    with open(path, encoding='utf-8') as handle:
        metadata = json.load(handle)
    version = metadata.get('format')
    if version not in ('preschool-mongodb-backup-v1', 'preschool-mongodb-backup-v2'):
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

    documents_archive = '-'
    documents_digest = '-'
    documents_size = '-'
    if version == 'preschool-mongodb-backup-v2':
        documents_archive = metadata.get('studentDocumentsArchive', '')
        documents_digest = metadata.get('studentDocumentsSha256', '')
        documents_size = metadata.get('studentDocumentsSizeBytes')
        archive_pattern = re.escape(name) + r'-[0-9]{8}T[0-9]{6}Z[.]student-documents[.]tar[.]gz[.]age'
        if not isinstance(documents_archive, str) or not re.fullmatch(archive_pattern, documents_archive):
            raise ValueError('invalid student-documents archive name in metadata')
        if not isinstance(documents_digest, str) or not re.fullmatch(r'[a-f0-9]{64}', documents_digest):
            raise ValueError('invalid student-documents checksum in metadata')
        if not isinstance(documents_size, int) or documents_size < 1 or documents_size > 5 * 1024 * 1024 * 1024 + 64 * 1024 * 1024:
            raise ValueError('invalid student-documents archive size in metadata')
        documents_size = str(documents_size)

    print('|'.join([name, documents_archive, documents_digest, documents_size]))
except Exception as error:
    print('Invalid backup metadata: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
)" || exit 1
IFS='|' read -r source_database student_documents_archive_name student_documents_expected_sha256 student_documents_expected_size <<< "$metadata_values"

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

student_documents_archive_path=""
if [[ "$student_documents_archive_name" != "-" ]]; then
  student_documents_archive_path="$(dirname -- "$archive_path")/$student_documents_archive_name"
  [[ -f "$student_documents_archive_path" && -s "$student_documents_archive_path" ]] || {
    printf 'The matching encrypted student-documents archive is missing or empty.\n' >&2
    exit 2
  }
  actual_documents_sha256="$(sha256sum "$student_documents_archive_path" | awk '{print $1}')"
  actual_documents_size="$(wc -c < "$student_documents_archive_path" | tr -d ' ')"
  [[ "$actual_documents_sha256" == "$student_documents_expected_sha256" ]] || {
    printf 'Student-documents archive checksum mismatch. Refusing restore.\n' >&2
    exit 2
  }
  [[ "$actual_documents_size" == "$student_documents_expected_size" ]] || {
    printf 'Student-documents archive size mismatch. Refusing restore.\n' >&2
    exit 2
  }
fi

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

if [[ "$student_documents_archive_name" != "-" ]]; then
  : "${RESTORE_PRIVATE_DOCUMENTS_DIR:?Set RESTORE_PRIVATE_DOCUMENTS_DIR to an empty, separate staging directory for private student documents.}"
  source_documents_dir="${PRIVATE_DOCUMENTS_DIR:-"$SCRIPT_DIR/../private-files/student-documents"}"
  python3 - "$source_documents_dir" "$RESTORE_PRIVATE_DOCUMENTS_DIR" <<'PY'
import os
import sys

source = os.path.realpath(sys.argv[1])
target = os.path.realpath(sys.argv[2])
if os.path.commonpath([source, target]) in (source, target):
    print('Student-document restore directory must be separate from live private storage.', file=sys.stderr)
    raise SystemExit(2)
os.makedirs(target, mode=0o700, exist_ok=True)
if not os.path.isdir(target):
    print('Student-document restore destination is not a directory.', file=sys.stderr)
    raise SystemExit(2)
if os.listdir(target):
    print('Student-document restore destination must be empty.', file=sys.stderr)
    raise SystemExit(2)
os.chmod(target, 0o700)
PY
fi

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

extracted_student_documents="$temp_dir/restored-student-documents"
if [[ "$student_documents_archive_name" != "-" ]]; then
  plain_student_documents_archive="$temp_dir/student-documents.tar.gz"
  mkdir -m 700 -- "$extracted_student_documents"
  age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$plain_student_documents_archive" "$student_documents_archive_path"
  [[ -s "$plain_student_documents_archive" ]] || { printf 'Decrypted student-documents archive is empty; refusing restore.\n' >&2; exit 1; }

  python3 - "$plain_student_documents_archive" "$extracted_student_documents" <<'PY'
import os
import re
import shutil
import sys
import tarfile

archive_path, destination = sys.argv[1:]
pattern = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}[.](pdf|jpg|jpeg|png|webp)', re.I)
seen = set()
total_size = 0
try:
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = archive.getmembers()
        for member in members:
            name = member.name
            if name in ('', '.', './') and member.isdir():
                continue
            if name.startswith('./'):
                name = name[2:]
            if '/' in name or '\\' in name or not pattern.fullmatch(name):
                raise ValueError('unsafe path in student-documents archive')
            if not member.isfile() or member.issym() or member.islnk():
                raise ValueError('non-regular entry in student-documents archive')
            if name in seen:
                raise ValueError('duplicate file in student-documents archive')
            if member.size < 1 or member.size > 10 * 1024 * 1024:
                raise ValueError('invalid student document size in archive')
            total_size += member.size
            if total_size > 5 * 1024 * 1024 * 1024:
                raise ValueError('student-documents archive exceeds 5 GB restore limit')
            seen.add(name)
        for member in members:
            name = member.name
            if name in ('', '.', './') and member.isdir():
                continue
            if name.startswith('./'):
                name = name[2:]
            source_file = archive.extractfile(member)
            if source_file is None:
                raise ValueError('unreadable student document in archive')
            target = os.path.join(destination, name)
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with source_file, os.fdopen(descriptor, 'wb') as output:
                shutil.copyfileobj(source_file, output)
            os.chmod(target, 0o600)
except Exception as error:
    print('Unsafe or unreadable student-documents archive: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
fi

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

if [[ "$student_documents_archive_name" != "-" ]]; then
  python3 - "$extracted_student_documents" "$RESTORE_PRIVATE_DOCUMENTS_DIR" <<'PY'
import os
import re
import shutil
import sys

source, destination = sys.argv[1:]
pattern = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}[.](pdf|jpg|jpeg|png|webp)', re.I)
if os.listdir(destination):
    print('Student-document restore destination changed during restore; refusing to overwrite files.', file=sys.stderr)
    raise SystemExit(2)
for name in os.listdir(source):
    if not pattern.fullmatch(name):
        print('Unexpected file in staged student documents.', file=sys.stderr)
        raise SystemExit(2)
    target = os.path.join(destination, name)
    shutil.copyfile(os.path.join(source, name), target)
    os.chmod(target, 0o600)
os.chmod(destination, 0o700)
PY
  MONGO_RESTORE_TARGET_URI="$MONGO_RESTORE_TARGET_URI" RESTORE_PRIVATE_DOCUMENTS_DIR="$RESTORE_PRIVATE_DOCUMENTS_DIR" node "$SCRIPT_DIR/verify-restore.js"
else
  MONGO_RESTORE_TARGET_URI="$MONGO_RESTORE_TARGET_URI" node "$SCRIPT_DIR/verify-restore.js"
fi
printf 'Restore rehearsal completed. This does not authorize a production restore or public SaaS signup.\n'
