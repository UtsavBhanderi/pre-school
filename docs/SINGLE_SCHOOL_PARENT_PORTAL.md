# Single-preschool Parent Portal

The current rollout supports one preschool. Parent activation does not require one invitation per family. The school shares one stable access URL; each parent uses the child record and a registered contact number to activate a login once.

## 1. Configure the school link

Set these backend environment variables before restarting the API:

```env
SINGLE_SCHOOL_NAME=Your Preschool Name
FRONTEND_URL=https://your-school-domain.example
```

The generated link is:

```
https://your-school-domain.example/parent-access/your-preschool-name
```

The slug is generated deterministically from `SINGLE_SCHOOL_NAME`, so it remains the same after restarts. If the school name uses a non-Latin script, set a readable ASCII school name/slug in the deployment configuration.

If the installation already has exactly one active `Organization` record, the portal uses that organization's slug and tenant guardian records. If more than one active organization exists, set `SINGLE_SCHOOL_ORGANIZATION_ID` to the intended organization ID. The parent route refuses to guess between multiple active schools.

For production, keep the normal secure authentication configuration in place, including a strong `JWT_SECRET`, HTTPS `FRONTEND_URL`, and the existing CORS settings.

## 2. Share the link from the school dashboard

1. Sign in as the school administrator.
2. Open **Dashboard → User access**.
3. Copy the **Parent portal access link**.
4. Share that same link with all parents through the school's chosen channel.

Parents do not need to be added through the staff account form. Parent invitations are disabled; staff invitations remain a separate workflow.

## 3. Parent sign-in (no parent registration required)

At `/parent-access/<school-slug>`, the parent enters only:

- The child's exact GR/admission number **or** the registered parent email saved in the school record.
- The parent's registered mobile number.

The school does not need to create a parent login manually, send an invitation, or ask the parent to register. The backend checks the submitted details against the saved student/family record. When they match, it creates or reuses the family account, links eligible siblings that share the same saved parent email and matching mobile, and signs the parent in.

The same link can be shared with every family. Parents can sign in again using any linked child's GR/admission number (or the saved parent email) and the same registered mobile. A separately invented parent email or password is not part of this single-school sign-in flow.

If a child's registered mobile number changes after a family account has been linked, the login is blocked with a clear contact-office message. The preschool office must update and verify the family contact record rather than allowing a second account to claim the same child.


## 4. School data required for automatic matching

### Older single-school student records

The current matching fields are:

| Parent entry | Student record field |
| --- | --- |
| GR/admission number | `stuNo` |
| Registered parent email | `parentEmail` |
| Registered mobile | `phoneNumber`, `FatherMobileNumber`, `FatherPhoneNumber`, or `EmergencyPhoneNumber` |

The phone comparison accepts a 10-digit Indian mobile number, a leading zero, or the `+91` country prefix. The underlying saved number still needs to be correct.

Siblings are linked automatically only when the stored parent email and registered phone match as well. Repeated sign-ins for the same family reuse the existing account. If a linked child's registered mobile changes, sign-in is blocked until the preschool office updates and verifies the family contact record; it does not create a second account for that child.

### One-organization data already migrated to SaaS

Matching uses the student GR number/email and the linked `Guardian` contact's phone. The resulting `OrganizationMembership` is restricted to those guardian IDs and their active branch links. The family record is not made globally visible.

## 5. What parents can use

The single-school family portal includes:

- Family overview and today's attendance summary.
- Linked child records and admission details.
- Attendance history with a selectable date range.
- Fee totals, payments received, discount, and outstanding balance.
- Active school-wide notices.
- School calendar events and holidays.
- Learning report cards, subject marks, percentages, and grades when those marks have been saved.
- Parent sign-in help and sign out (the single-school parent login uses the child's GR/email plus the registered mobile number, not a separate password).

The legacy single-school model does not currently store the tenant arrival/pickup handover history, so that tenant-only feature is not shown in this standalone portal.

## 6. Parent access management

Parent accounts appear in **Dashboard → User access**. An administrator can suspend or restore parent sign-in. The parent role and family child links cannot be edited from the staff role editor. Status changes also revoke existing sign-in sessions and are written to the access history. To change a linked family's phone number, update and verify the student/family record through the school office; the parent login does not create a replacement account when a previously linked child's phone changes.

If a parent's email or phone is incorrect, update the underlying student/family contact record first. If the family account was already activated against an incorrect record, contact the school administrator before changing account links.

## 7. Important security note

The initial activation checks that the GR/email and phone match the school's stored records and limits repeated attempts. This is a database-record match; it does **not** prove the person currently controls the phone. No SMS one-time password is sent by this implementation. Add an SMS OTP provider before treating mobile possession as independently verified, especially before sharing sensitive child or health information.

The built-in request limiter applies a stricter limit to each GR/email-plus-mobile combination and a broader per-IP ceiling. It is process-local and is not shared across multiple API instances, so keep infrastructure-level rate limiting at the CDN, WAF, reverse proxy, or API gateway for public production traffic.


## Parent engagement: homework, family messages and polls

The single-school parent portal includes a family engagement area:

- **Homework:** teachers and administrators can publish activities for every class or one class. Parents can read instructions, add an optional note and mark the work complete for each linked child.
- **Private messages:** parents can send a question or concern linked to one of their children. Only authenticated school staff can read and respond; the family can follow its open, in-progress or resolved status.
- **Polls:** staff can publish a question with 2–6 options for all families or one class. Each parent account can vote once per poll. The portal shows aggregate counts, not voter identities.

Staff manage these features from **Parent communication** in the administrator or teacher workspace. Content is scoped to legacy single-school student records and is not available to unrelated tenant workspaces.


## Manually creating teacher logins

In the single-school workspace, the administrator creates each teacher's login from **User access**. Select the **Teacher** role, enter the teacher's email ID and choose an initial password (12–128 characters). The account is active immediately. There is no teacher invitation, email verification link or OTP step; share the credentials privately with the teacher. The email in **Teacher records** is a staff profile contact field, so use the same email address when creating the login under **User access**. Teachers sign in from the normal login page with that email ID and password.
