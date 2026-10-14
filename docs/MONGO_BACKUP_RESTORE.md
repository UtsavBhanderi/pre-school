# MongoDB backup and restore rehearsal

This runbook supports an encrypted backup and a **non-production restore rehearsal**. It is not authorization to restore onto a production deployment. Do not enable SaaS registration because a backup or restore command succeeds.

## Safety model

- Backups are compressed MongoDB archives, encrypted to an **age** public recipient and accompanied by a SHA-256 checksum and non-sensitive metadata.
- The backup helper reads **MONGO_URI** from the process environment and writes the connection string only to a mode-0600 temporary config file. The config is removed when the script exits.
- The output directory is created with mode 0700. Backup and metadata files are mode 0600. The default path **backend/backups/** is excluded from Git.
- Store the encrypted archive and its **.meta.json** sidecar in approved encrypted off-host storage. A backup on the same machine as the database is not a sufficient disaster-recovery plan.
- Restores require an approved operator, a change-ticket reference, **RESTORE_TARGET_ENV=staging**, an exact target database confirmation, and a database named **restore_test_***.
- The restore helper refuses to restore to the database name in the source metadata and refuses to restore to the same MongoDB endpoint fingerprint. Use a dedicated staging MongoDB deployment.
- The restore helper uses namespace remapping and **--drop** only inside the dedicated **restore_test_*** database, and stops on a restore error.
- After restore, verification checks for core organization/branch/membership records and the unique organization slug, branch-code, and membership indexes. It prints counts, not personal records.
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
- **backend/backups/preschool-20261014T020000Z.archive.gz.age.meta.json**

The actual database name and UTC timestamp depend on the configured URI and run time. Copy both files to the approved off-host store and confirm the uploaded archive's checksum. Keep enough backups to meet your retention policy; this helper does not implement automatic retention/deletion.

The metadata contains the source database name, a hash of the endpoint authority, date, tool version, archive size, source label, and archive checksum. It never stores the connection URI or credentials.

## Rehearse restore into a separate staging deployment

First, provision a **separate staging MongoDB deployment** and a dedicated database name starting with **restore_test_**, for example **restore_test_20261014**. The destination account needs the privileges required to restore collections and indexes into that database. Do not point it at production. Avoid sharing destination credentials with the backup-only account.

Make the encrypted archive and its **.meta.json** sidecar available to the approved operator, then run:

~~~bash
cd backend
export MONGO_RESTORE_TARGET_URI="$(cat /run/secrets/preschool-staging-restore-uri)"
export BACKUP_AGE_IDENTITY_FILE="/secure/path/preschool-backup-identity.txt"
export RESTORE_TARGET_ENV="staging"
export RESTORE_CONFIRM_TARGET_DATABASE="restore_test_20261014"
export RESTORE_APPROVED_BY="authorized-operator"
export RESTORE_CHANGE_TICKET="CHG-12345"
bash ops/mongo-restore-to-staging.sh "/secure/backups/preschool-20261014T020000Z.archive.gz.age"
~~~

The placeholder URI, database name, operator and ticket above are examples, not ready-to-use values. The confirmed database must exactly match the database in the target URI. The target endpoint must differ from the source endpoint recorded in backup metadata.

The script verifies metadata and checksum before decrypting, restores the source namespace into the test database, then invokes **verify-restore.js**. Because **--drop** is used, rerunning a restore replaces matching collections **inside the named restore_test_* database**. Use a fresh test database for each rehearsal unless the approved change explicitly permits reusing it.

## Acceptance checklist

Record the outcome and elapsed time for each rehearsal:

- [ ] Backup produced a non-empty encrypted archive and matching metadata.
- [ ] Both files were copied to the approved off-host backup store.
- [ ] Archive checksum matched the metadata before restore.
- [ ] Restore ran against the separate test deployment and a **restore_test_*** database only.
- [ ] Restore completed with no skipped/error documents.
- [ ] Post-restore verification found organizations, branches, memberships and the required unique tenant isolation indexes.
- [ ] A responsible operator opened the restored application in a restricted staging environment and tested login, branch selection, child list, attendance, fee/receipt history and parent-link access using synthetic/test records.
- [ ] Source/target counts and any known financial totals were compared; unexpected differences were investigated.
- [ ] The rehearsal record includes approver, ticket, backup timestamp, restore timestamp, result and any follow-up actions.
- [ ] Backup retention, access permissions, encryption-key recovery and disaster-recovery RTO/RPO were reviewed.

A passing command only verifies technical restoration of a database snapshot; it does not prove user-facing workflows, integrations, uploads/private media, or every fee total are correct. Do not use production personal data in a public demo or unsecured staging environment. Restore testing must comply with the school's retention, consent and privacy policies.

## What these scripts deliberately do not do

They do not schedule backups, upload to cloud storage, prune old backups, run an in-place production restore, restore MongoDB server users/roles, rotate the encryption key, or migrate data between application versions. Automate those operations only through a reviewed infrastructure plan. Keep public SaaS registration disabled until the entire release checklist and a full staging recovery drill have sign-off.
