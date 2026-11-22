#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-"$SCRIPT_DIR/../backups"}"

for command_name in mongodump age sha256sum python3 date stat tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required tool is missing: %s\n' "$command_name" >&2
    exit 1
  }
done

: "${MONGO_URI:?Set MONGO_URI to the single school database to back up.}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT to the age public recipient for encrypted backups.}"
: "${BACKUP_SOURCE_LABEL:?Set BACKUP_SOURCE_LABEL to a non-sensitive name such as production-weekly.}"

database_name="$(python3 - "$MONGO_URI" <<'PY'
import re
import sys
from urllib.parse import unquote, urlsplit

uri = sys.argv[1]
try:
    parsed = urlsplit(uri)
    if parsed.scheme not in ('mongodb', 'mongodb+srv'):
        raise ValueError('unsupported MongoDB URI scheme')
    name = unquote(parsed.path.lstrip('/').split('/', 1)[0])
    if not name or not re.fullmatch(r'[A-Za-z0-9_-]{1,63}', name):
        raise ValueError('URI must name one database using letters, numbers, underscores or hyphens')
    if name.lower() in {'admin', 'config', 'local'}:
        raise ValueError('backing up a MongoDB system database is not supported')
    print(name)
except Exception as error:
    print('Invalid MONGO_URI: ' + str(error), file=sys.stderr)
    raise SystemExit(2)
PY
)" || exit 1

# Store only a hash of the host/seed-list authority in the sidecar so a restore
# script can reject a same-deployment target without exposing hosts or credentials.
source_endpoint_sha256="$(python3 - "$MONGO_URI" <<'PY'
import hashlib
import sys
from urllib.parse import urlsplit

parsed = urlsplit(sys.argv[1])
authority = parsed.netloc.rsplit('@', 1)[-1].lower()
endpoint = ','.join(sorted(authority.split(',')))
print(hashlib.sha256(endpoint.encode('utf-8')).hexdigest())
PY
)" || exit 1

if ! [[ "$BACKUP_SOURCE_LABEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$ ]]; then
  printf 'BACKUP_SOURCE_LABEL must be 1–80 safe letters, numbers, dots, underscores or hyphens.\n' >&2
  exit 1
fi

mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
BACKUP_DIR="$(cd -- "$BACKUP_DIR" && pwd)"
PRIVATE_DOCUMENTS_DIR="${PRIVATE_DOCUMENTS_DIR:-"$SCRIPT_DIR/../private-files/student-documents"}"
mkdir -p -- "$PRIVATE_DOCUMENTS_DIR"
chmod 700 -- "$PRIVATE_DOCUMENTS_DIR"
PRIVATE_DOCUMENTS_DIR="$(cd -- "$PRIVATE_DOCUMENTS_DIR" && pwd -P)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive_name="${database_name}-${timestamp}.archive.gz.age"
student_documents_archive_name="${database_name}-${timestamp}.student-documents.tar.gz.age"
metadata_name="${archive_name}.meta.json"
final_archive="$BACKUP_DIR/$archive_name"
final_student_documents_archive="$BACKUP_DIR/$student_documents_archive_name"
final_metadata="$BACKUP_DIR/$metadata_name"

if [[ -e "$final_archive" || -e "$final_student_documents_archive" || -e "$final_metadata" ]]; then
  printf 'Refusing to overwrite an existing backup artifact.\n' >&2
  exit 1
fi

temp_dir="$(mktemp -d "$BACKUP_DIR/.backup-tmp.XXXXXX")"
chmod 700 -- "$temp_dir"
cleanup() { rm -rf -- "$temp_dir"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

config_file="$temp_dir/mongodump.yml"
plain_archive="$temp_dir/$database_name.archive.gz"
encrypted_archive="$temp_dir/$archive_name"
plain_student_documents_archive="$temp_dir/student-documents.tar.gz"
encrypted_student_documents_archive="$temp_dir/$student_documents_archive_name"
metadata_tmp="$temp_dir/$metadata_name"

# MongoDB Database Tools 100.3+ supports --config. It keeps credentials out
# of the process argument list. JSON quoting produces a valid YAML scalar.
python3 - "$config_file" "$MONGO_URI" <<'PY'
import json
import os
import sys

path, uri = sys.argv[1], sys.argv[2]
with open(path, 'w', encoding='utf-8') as handle:
    handle.write('uri: ' + json.dumps(uri) + '\n')
os.chmod(path, 0o600)
PY

tool_version="$(mongodump --version | head -n 1 | tr -d '\r')"
printf 'Creating a compressed dump for database "%s"...\n' "$database_name"
mongodump --config "$config_file" --archive="$plain_archive" --gzip --readPreference=primary
[[ -s "$plain_archive" ]] || { printf 'Backup archive is empty; refusing to continue.\n' >&2; exit 1; }

# Private student documents are stored outside public uploads. Validate the
# flat UUID-only directory before including it in the encrypted backup.
python3 - "$PRIVATE_DOCUMENTS_DIR" <<'PY'
import os
import re
import sys

root = sys.argv[1]
pattern = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(pdf|jpg|jpeg|png|webp)', re.I)
total_size = 0
for entry in os.scandir(root):
    if not entry.is_file(follow_symlinks=False) or not pattern.fullmatch(entry.name):
        print('Unsafe entry in private student-document storage; refusing backup.', file=sys.stderr)
        raise SystemExit(2)
    size = entry.stat(follow_symlinks=False).st_size
    if size < 1 or size > 10 * 1024 * 1024:
        print('A private student document has an invalid size; refusing backup.', file=sys.stderr)
        raise SystemExit(2)
    total_size += size
    if total_size > 5 * 1024 * 1024 * 1024:
        print('Private student documents exceed the 5 GB backup limit.', file=sys.stderr)
        raise SystemExit(2)
PY

tar -czf "$plain_student_documents_archive" -C "$PRIVATE_DOCUMENTS_DIR" .
[[ -s "$plain_student_documents_archive" ]] || { printf 'Student-documents archive is empty; refusing to continue.\n' >&2; exit 1; }


printf 'Encrypting backup with age...\n'
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted_archive" "$plain_archive"
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted_student_documents_archive" "$plain_student_documents_archive"
[[ -s "$encrypted_student_documents_archive" ]] || { printf 'Encrypted student-documents backup is empty; refusing to continue.\n' >&2; exit 1; }
[[ -s "$encrypted_archive" ]] || { printf 'Encrypted backup is empty; refusing to continue.\n' >&2; exit 1; }

archive_sha256="$(sha256sum "$encrypted_archive" | awk '{print $1}')"
archive_size="$(stat -c '%s' "$encrypted_archive" 2>/dev/null || stat -f '%z' "$encrypted_archive")"
student_documents_sha256="$(sha256sum "$encrypted_student_documents_archive" | awk '{print $1}')"
student_documents_size="$(stat -c '%s' "$encrypted_student_documents_archive" 2>/dev/null || stat -f '%z' "$encrypted_student_documents_archive")"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$metadata_tmp" "$archive_name" "$database_name" "$archive_sha256" "$archive_size" "$created_at" "$tool_version" "$BACKUP_SOURCE_LABEL" "$source_endpoint_sha256" "$student_documents_archive_name" "$student_documents_sha256" "$student_documents_size" <<'PY'
import json
import os
import sys

path, archive, database, digest, size, created, tool_version, source_label, endpoint_sha256, documents_archive, documents_digest, documents_size = sys.argv[1:]
metadata = {
    'format': 'preschool-mongodb-backup-v2',
    'archive': archive,
    'database': database,
    'sourceEndpointSha256': endpoint_sha256,
    'createdAtUtc': created,
    'sourceLabel': source_label,
    'encryption': 'age',
    'sha256': digest,
    'sizeBytes': int(size),
    'databaseToolsVersion': tool_version,
    'studentDocumentsArchive': documents_archive,
    'studentDocumentsSha256': documents_digest,
    'studentDocumentsSizeBytes': int(documents_size),
}
with open(path, 'w', encoding='utf-8') as handle:
    json.dump(metadata, handle, indent=2)
    handle.write('\n')
os.chmod(path, 0o600)
PY

chmod 600 -- "$encrypted_archive" "$encrypted_student_documents_archive" "$metadata_tmp"
mv -- "$encrypted_archive" "$final_archive"
mv -- "$encrypted_student_documents_archive" "$final_student_documents_archive"
mv -- "$metadata_tmp" "$final_metadata"
printf 'Encrypted database backup created: %s\n' "$final_archive"
printf 'Encrypted student-documents backup created: %s\n' "$final_student_documents_archive"
printf 'Metadata: %s\n' "$final_metadata"
printf 'Database SHA-256: %s\n' "$archive_sha256"
printf 'Student-documents SHA-256: %s\n' "$student_documents_sha256"
printf 'Copy all three files to approved encrypted off-host storage and rehearse restores regularly.\n'