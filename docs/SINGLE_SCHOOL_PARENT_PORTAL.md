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

## 3. Parent activation

At `/parent-access/<school-slug>`, the parent enters:

- The child's exact GR/admission number **or** the registered parent email saved in the school record.
- The parent's registered mobile number.
- The parent's full name and the email address they want to use to sign in.
- A password and confirmation.

For a new login, use a password of at least 12 characters. When the email already belongs to an account, enter that account's current password instead of creating a different password.

After the school record matches, the parent is signed in and sent to the family portal. Next time, the parent uses the regular `/login` page with the login email and password.

## 4. School data required for automatic matching

### Older single-school student records

The current matching fields are:

| Parent entry | Student record field |
| --- | --- |
| GR/admission number | `stuNo` |
| Registered parent email | `parentEmail` |
| Registered mobile | `phoneNumber`, `FatherMobileNumber`, `FatherPhoneNumber`, or `EmergencyPhoneNumber` |

The phone comparison accepts a 10-digit Indian mobile number, a leading zero, or the `+91` country prefix. The underlying saved number still needs to be correct.

Siblings are linked automatically only when the stored parent email and registered phone match as well. A second login cannot claim a child again using the same registered phone. A parent with a separately registered mobile can have a separate account.

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
- Parent password change and sign out.

The legacy single-school model does not currently store the tenant arrival/pickup handover history, so that tenant-only feature is not shown in this standalone portal.

## 6. Parent access management

Parent accounts appear in **Dashboard → User access**. An administrator can suspend or restore parent sign-in. The parent role and family child links cannot be edited from the staff role editor. Status changes also revoke existing sign-in sessions and are written to the access history.

If a parent's email or phone is incorrect, update the underlying student/family contact record first. If the family account was already activated against an incorrect record, contact the school administrator before changing account links.

## 7. Important security note

The initial activation checks that the GR/email and phone match the school's stored records and limits repeated attempts. This is a database-record match; it does **not** prove the person currently controls the phone. No SMS one-time password is sent by this implementation. Add an SMS OTP provider before treating mobile possession as independently verified, especially before sharing sensitive child or health information.

The built-in request limiter is process-local. Keep infrastructure-level rate limiting at the CDN, WAF, reverse proxy, or API gateway for public production traffic.
