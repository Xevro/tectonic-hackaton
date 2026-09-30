# Security

Situation 141 handles inferences about people's lives, so the security model
is designed around who may see what, not just who may log in.

## Threats we designed against

| Threat | Control | Where |
|---|---|---|
| Unauthenticated access | Bearer token required on every data endpoint | `api/main.py` `current()` |
| Stolen config leaks secrets | Only SHA-256 hashes of tokens are configured, never raw tokens | `api/make_tokens.py` |
| Timing attacks on tokens | `hmac.compare_digest` | `current()` |
| Privilege escalation | Three roles, checked per endpoint. Analysts cannot approve | `require()` |
| IDOR on customer data | No customer endpoint accepts a household id. Identity comes from the token only | `/me/*` |
| Enumeration of other customers' insights | Wrong insight id returns 404, not 403, so existence is not revealed | `correct_insight()` |
| Bypassing the ethics gate | Approving a suppressed or protection-only situation is refused server-side with 409 | `review()` |
| Mass assignment | Request models forbid unknown fields | `Strict` |
| Path tricks in ids | Ids validated against `^S[0-9]{3}$` | `Path(pattern=...)` |
| Oversized payloads | 4 KB body limit | `hardening` middleware |
| Abuse and scraping | 60 requests per minute per principal | `current()` |
| Clickjacking, sniffing, caching | `X-Frame-Options: DENY`, `nosniff`, `no-store`, restrictive CSP | `hardening` |
| Unaccountable decisions | Every review and customer correction is appended to an audit log | `_audit()` |

## Data protection by design

- **Suppressed cohorts are never attached to an individual.** A household in a
  separation or financial-distress cohort has no stored inference that could
  leak through `/me`. There is nothing to show, so nothing can be shown.
- **Customers see their own data only, in their own terms.** The customer view
  never contains cohort sizes or statistics about other people.
- **Inferences, not only evidence, are gated.** Baby-shop spending before a
  birth is not health data, but it implies a pregnancy, and inferred health
  data is still health data. The gate treats it that way.
- **The console is static.** `out/console.html` contains synthetic data only,
  makes no network calls, and holds no keys.

## Not in scope for the hackathon

Production identity (itsme or KBC SSO), key rotation, persistent storage with
encryption at rest, and a distributed rate limiter.

## Tests

`python -m pytest -q tests/` covers missing and invalid tokens, role checks,
the gate override, unknown fields, malformed ids, security headers, and the
IDOR case where one customer tries to correct another customer's insight.
