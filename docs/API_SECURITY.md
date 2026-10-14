# API security controls

This document describes the API-level defensive controls added to the preschool platform. These controls reduce common risks but do not replace a secure deployment, authorization checks, tenant isolation or monitoring.

## Response headers

The Express API applies the following headers to responses:

- \`X-Content-Type-Options: nosniff\` helps prevent MIME-type sniffing.
- \`X-Frame-Options: DENY\` blocks framing of API responses.
- \`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'\` makes API responses non-executable in a browser document.
- \`Referrer-Policy: no-referrer\` avoids sending URLs through the browser's Referer header.
- \`Cache-Control: no-store\` prevents browser/proxy caching of sensitive API responses.
- \`Permissions-Policy\` disables camera, microphone and geolocation access for the API origin.
- \`Cross-Origin-Opener-Policy: same-origin\` isolates browsing contexts.
- HSTS is sent only in production for a request marked HTTPS.

The frontend is deployed separately in some environments; these headers are for the Express API and do not configure the frontend host's CSP.

## Public endpoint request limits

The process includes bounded fixed-window limits for sensitive unauthenticated endpoints:

| Endpoint group | Limit | Window |
| --- | ---: | --- |
| Sign-in | 10 requests | 15 minutes |
| Legacy account creation endpoint | 20 requests | 15 minutes |
| Password reset request and completion | 5 requests | 1 hour |
| Organization sign-up and verification flow | 8 requests | 1 hour |
| Public invitation inspection | 20 requests | 15 minutes |
| Public invitation acceptance | 8 requests | 15 minutes |

Responses use HTTP 429 and include \`Retry-After\` plus the \`RateLimit-*\` headers when a limit is reached. Buckets expire automatically and the in-process table is bounded; under table-capacity pressure, new client keys are rejected temporarily rather than evicting another client's active limit.

### Deployment requirements for rate limits

**The built-in limiter is process-local.** It helps stop repeated attempts against one running API process, but it is not a shared counter across replicas and can be reset by a process restart. Put equivalent or stricter distributed limits at the CDN, WAF, reverse proxy or API gateway before public production traffic.

The limiter uses Express's resolved \`req.ip\`. By default \`TRUST_PROXY_HOPS=0\`, so Express does not trust forwarded client-IP headers. If the API is behind a reverse proxy, configure \`TRUST_PROXY_HOPS\` to the exact number of trusted proxy hops in that deployment. Do not set it by guess or trust arbitrary client-supplied forwarding headers; an incorrect proxy setting can cause users to share a rate-limit bucket or allow spoofed IPs.

Test this configuration after deployment by checking server logs and API requests from at least two client networks. Keep secrets and personal information out of logs and never log invitation/password-reset tokens.

## Controls still required

- Distributed rate limiting at the infrastructure edge.
- Alerting on repeated authentication failures, invalid invitation tokens, and rate-limit spikes.
- Staging tests for the exact TLS termination, reverse-proxy hop count and CORS origins.
- Review that every route checks role, organization and branch scope server-side; rate limiting is not authorization.
- A tested account/session revocation path, an incident response process, backup restore drills, and access reviews.
