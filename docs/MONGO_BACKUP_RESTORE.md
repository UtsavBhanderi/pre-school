# MongoDB backup and restore rehearsal

This runbook supports an encrypted backup and a **non-production restore rehearsal**. It is not authorization to restore onto a production deployment. Do not enable SaaS registration because a backup or restore command succeeds.

## Safety model

- Backups contain a compressed MongoDB archive and a separate compressed archive of private student documents. Both archives are encrypted to an **age** public recipient and checksummed in one non-sensitive metadata sidecar (format v2). The restore helper still accepts older v1 database-only backups.
- The backup helper reads **MONGO_URI** from the process environment and writes the connection string only to a mode-0600 temporary config file. The config is removed when the script exits.
- The output directory is created with mode 0700. Both encrypted archives and metadata are mode 0600. The default paths **backend/backups/** and **backend/private-files/** are excluded from Git. Private documents are never copied into public uploads.
- Store all three matching artifacts—the database **.archive.gz.age**, the **.student-documents.tar.gz.age**, and the database archive's **.meta.json** sidecar—in approved encrypted off-host storage. A backup on the same machine as the database is not a sufficient disaster-recovery plan.
- Restores require an approved operator, a change-ticket reference, **RESTORE_TARGET_ENV=staging**, an exact target database confirmation, and a database named **restore_test_***.
- The restore helper refuses to restore to the database name in the source metadata and refuses to restore to the same MongoDB endpoint fingerprint. Use a dedicated staging MongoDB deployment.
- The restore helper uses namespace remapping and **--drop** only inside the dedicated **restore_test_*** database, and stops on a restore error.
- After restore, verification checks the single-school `users`, `students` and `teachers` collections, at least one active administrator, the unique user/student/teacher identity indexes, and the absence of SaaS organization or membership records. For v2 backups it also checks every private student-document file against its database storage name, size and SHA-256 checksum. It prints counts, not personal records.
- Use MongoDB Database Tools 100.3 or newer, **age**, **python3**, Node.js/npm dependencies, and a MongoDB deployment that can restore the backup's index options.

These gates lower the chance of a mistaken restore, but they are not a substitute for reviewing the destination URI, access controls, and approval before running the command.

## Create an age recipient

Install **age** according to your organization's approved package-management process. Generate the identity on an access-controlled operator device, not inside the application repository:

~~~bash
umask 077
age-keygen -o /secure/path/preschool-backup-identity.txt
age-keygen -y /secure/path/preschool-backup-identity.txt
~~~

The second command prints the public recipient. Store the **private identity** offline in an approved secrets manager or recovery vault, with access limited to restore operators. Provide only the public recipient to the backup job. Do not commit either value to Git.

## Make a backup

Inject **MONGO_URI** from your approved secret manager. Never paste a credential-bearing URI into a ticket, Git file, shell transcript, or chat. Choose a non-sensitive label that identifies the source environment without naming children or families.

~~~bash
cd backend
export MONGO_URI="$(cat /run/secrets/preschool-mongo-backup-uri)"
export BACKUP_AGE_RECIPIENT="age1replace-with-approved-public-recipient"
export BACKUP_SOURCE_LABEL="production-weekly"
bash ops/mongo-backup.sh
~~~

The script creates files like:

- **backend/backups/preschool-20261014T020000Z.archive.gz.age**
- **backend/backups/preschool-20261014T020000Z.student-documents.tar.gz.age**
- **backend/backups/preschool-20261014T020000Z.archive.gz.age.meta.json**

The actual database name and UTC timestamp depend on the configured URI and run time. Copy all three matching files to the approved off-host store and confirm both encrypted archive checksums against the metadata. The private document archive includes only flat, server-generated UUID filenames with supported extensions; unexpected files, symlinks or oversized documents make the backup fail safely. Keep enough backups to meet your retention policy; this helper does not implement automatic retention/deletion.

The metadata contains the source database name, a hash of the endpoint authority, date, tool version, each archive's size and SHA-256 checksum, source label, and the private-documents archive filename. It never stores the connection URI or credentials.

## Rehearse restore into a separate staging deployment

First, provision a **separate staging MongoDB deployment** and a dedicated database name starting with **restore_test_**, for example **restore_test_20261014**. The destination account needs the privileges required to restore collections and indexes into that database. Do not point it at production. Avoid sharing destination credentials with the backup-only account.

Make the database archive, private-documents archive and matching **.meta.json** sidecar available to the approved operator. Create an empty, restricted staging directory for the private files, separate from the application's live **backend/private-files/student-documents/** directory. Then run:

~~~bash
cd backend
export MONGO_RESTORE_TARGET_URI="$(cat /run/secrets/preschool-staging-restore-uri)"
export BACKUP_AGE_IDENTITY_FILE="/secure/path/preschool-backup-identity.txt"
export RESTORE_TARGET_ENV="staging"
export RESTORE_CONFIRM_TARGET_DATABASE="restore_test_20261014"
export RESTORE_APPROVED_BY="authorized-operator"
export RESTORE_CHANGE_TICKET="CHG-12345"
export RESTORE_PRIVATE_DOCUMENTS_DIR="/secure/staging/private-student-documents"
bash ops/mongo-restore-to-staging.sh "/secure/backups/preschool-20261014T020000Z.archive.gz.age"
~~~

The placeholder URI, database name, operator and ticket above are examples, not ready-to-use values. The confirmed database must exactly match the database in the target URI. The target endpoint must differ from the source endpoint recorded in backup metadata.

The script verifies both encrypted archive checksums before decrypting, validates every private archive member (rejecting path traversal, links, non-regular files and unsupported names), restores the source namespace into the test database, and copies private files only into the explicitly supplied empty staging directory. It never overwrites live private storage. It then invokes **verify-restore.js** to compare the staged files with their restored database records. Because **--drop** is used, rerunning a restore replaces matching collections **inside the named restore_test_* database**. Use a fresh test database for each rehearsal unless the approved change explicitly permits reusing it.

## Acceptance checklist

Record the outcome and elapsed time for each rehearsal:

- [ ] Backup produced two non-empty encrypted archives and matching v2 metadata.
- [ ] All three artifacts were copied to the approved off-host backup store.
- [ ] Both encrypted archive checksums and sizes matched the metadata before restore.
- [ ] Restore ran against the separate test deployment and a **restore_test_*** database only.
- [ ] Restore completed with no skipped/error documents.
- [ ] Post-restore verification found the single-school users/students/teachers collections, an active administrator, unique identity indexes, no SaaS organization or membership records, and all private student documents matched their recorded size and SHA-256.
- [ ] A responsible operator opened the restored application in a restricted staging environment and tested login, branch selection, child list, attendance, fee/receipt history and parent-link access using synthetic/test records.
- [ ] Source/target counts and any known financial totals were compared; unexpected differences were investigated.
- [ ] The rehearsal record includes approver, ticket, backup timestamp, restore timestamp, result and any follow-up actions.
- [ ] Backup retention, access permissions, encryption-key recovery and disaster-recovery RTO/RPO were reviewed.

A passing command verifies technical restoration of a database snapshot and any attached private student documents; it does not prove user-facing workflows, integrations, other uploads/private media, or every fee total are correct. Do not use production personal data in a public demo or unsecured staging environment. Restore testing must comply with the school's retention, consent and privacy policies.

## What these scripts deliberately do not do

They do not schedule backups, upload to cloud storage, prune old backups, run an in-place production restore, restore MongoDB server users/roles, rotate the encryption key, or migrate data between application versions. Automate those operations only through a reviewed infrastructure plan. Keep public SaaS registration disabled until the entire release checklist and a full staging recovery drill have sign-off.
