# Alphabet Tracking Intelligence

Public aggregate dashboard + first-party tracking gateway for Alphabet Facade.

Dashboard: https://alphabet-sparklab-tracking.siraphobice1995.chatgpt.site

| Tracking path | Exact custom event | Destination |
|---|---|---|
| `/t/request-quotation` | `Request Quotation` | https://www.alphabetfacade.com/request-quotation.html |
| `/t/project-start` | `Project Start` | https://www.alphabetfacade.com/project-start.html |
| `/t/facade-care` | `Facade Care` | https://www.alphabetfacade.com/facade-care.html |

## Current activation state

Visit recording, aggregate dashboard and Meta delivery are live. CAPI token is stored in Supabase Edge Function Secrets. All three custom events received real CAPI acknowledgements during the initial setup tests. Owner approved permanent per-visitor/per-link deduplication. Applied supabase/lifetime.sql; window_mode=lifetime, window_confirmed=true. Existing identities are preserved. Browser cookies remain subject to expiry/deletion; this cannot guarantee cross-device or truly eternal identity. No mock statistics. Historic visits are not backfilled into Meta when enabled later.

## Architecture

- Cloudflare Sites Worker handles `/t/*`, creates signed HttpOnly Secure first-party visitor cookies, records every GET in Supabase, then presents an explicit allow/deny marketing consent page. Each subsequent visit asks again. GPC overrides allow. All operating systems are supported.
- Sites calls Supabase `tracking-api` through a secret server-only bridge key. The Edge Function validates its SHA-256 digest in the private settings table. Built-in service-role credentials remain only in the Supabase runtime.
- PostgreSQL transactions + advisory locks serialize the same visitor/link. Rolling-window records and an additional unique constraint prevent race conditions; a campaign window can use fixed start/end dates instead. Each GET has its own visit ID. RPC request retries with the same ID are idempotent.
- A denied/unknown consent never loads Pixel or sends CAPI. Granted consent only sends after activation. A first granted visit claims one event per unique/window. Later repeat visits do not send new Meta events for that unique. A previously denied first visit can be followed by a later granted visit.
- Meta Pixel `trackCustom` and CAPI use exactly the same case-sensitive event name and event UUID. No additional PageView is sent.
- CAPI delivery uses a durable outbox. Supabase pg_cron invokes the authenticated Edge Function every minute; exponential backoff starts at one minute and caps at one hour. Each event has at most 10 attempts and a 47-hour deadline. Retry 429/5xx/network errors and Meta transient errors; stop permanent validation/authentication errors. Expired sending leases recover after two minutes. SKIP LOCKED prevents overlapping claims, and a lease UUID prevents stale completions overwriting the winner. Every retry preserves original event_id/event_name/event_time. Browser Pixel is dispatched only on the first claim.
- Retry endpoint uses a separate narrow key whose plaintext exists only in Supabase Vault; DB settings store a hash. The retry key cannot read statistics or insert visits. No browser endpoint exposes the retry action.
- Initial setup records are marked is_test and excluded from the default live report. Dashboard can switch to test records. The original QA visitor remains in tracking_test_visitors so repeats from that same browser remain tests until the owner resets the data. Test mode cannot be enabled by an arbitrary public URL parameter. META_TEST_EVENT_CODE is used only for is_test events when configured; old tests already accepted by Meta cannot be removed by clearing Supabase.
- browser_dispatched_at means the Meta library loaded and the local queue was dispatched; it does not prove Meta received or deduplicated the browser event. Final Meta Events Manager verification requires the authorized Chrome session.
- Direct visits to destination URLs bypass this gateway. Replace ad URLs with Tracking URLs. A custom `track.alphabetfacade.com` domain can be attached later. Cookies are scoped to the tracking host; no cross-device identity or fingerprinting.

## Privacy and statistics

Raw tables have RLS enabled, no anon/authenticated grants or policies, and RPCs are executable only by service_role. No visitor IDs, user agents, bridge key, or token appear in public aggregate responses. Dashboard audience is intentionally public. Admin writes happen in Supabase, not in the public UI.

The application does not collect/store visitor IPs, does not filter by operating system, and strips query strings before saving source URLs. Platform network infrastructure may maintain its own request logs. It does store a first-party UUID and user agent for the requested tracking purposes. Clearing cookies or switching devices creates a new visitor. Visits include bots/link-preview GETs; no claim that this equals human clicks. Unique totals sum per-link first occurrences in the selected date range, not a distinct-person count across all three links. Visits outside a configured fixed campaign window are recorded but do not add Unique or Meta events.

Meta accepted counts CAPI acknowledgements by event creation date. It is not an Ads Manager attributed-conversion count, and not proof of browser delivery. Browser Pixel delivery can be blocked by browsers/extensions. A 1.5-second handoff lets the Pixel send; blocked Pixel does not prevent destination access. Database or gateway errors fail closed rather than silently dropping visits.

Consent notice version: `alphabet-marketing-v1`. It describes browser identity and Meta advertising measurement and provides equally accessible allow/deny choices. It is not integrated with any existing destination-site CMP. Review the notice and analytics cookie basis with the site's own privacy policy before a paid campaign; no claim of legal certification. Add retention/purge rules appropriate to the final campaign window.

## Activate safely (owner/admin only)

1. In Supabase project `hvrclmycmpgmnpwyzznw` → Edge Functions → Secrets, set `META_CAPI_ACCESS_TOKEN`. Optional `META_TEST_EVENT_CODE` routes testing into Meta Test Events. Never put either value in source, the public browser, chat, or a GitHub issue.
2. The owner selected lifetime deduplication. Keep the current mode; no rolling reset is needed. After securely configuring and testing the token, enable delivery:

```sql
update public.tracking_settings
set window_mode='lifetime', window_confirmed=true, meta_enabled=true
where id;
```

For a fixed window, use `window_mode='campaign'`, explicit `campaign_start` and `campaign_end` with `+07:00`, `window_version=gen_random_uuid()` and `window_confirmed=true`. Start is inclusive; end is exclusive. No example live dates are supplied to avoid accidental activation.

3. Test allow, deny, repeated visits and all three events in Meta Test Events; confirm browser/server matching event IDs. Remove the test code before live traffic. If test data is retained in these tables, it remains part of the dashboard totals; use a controlled test window or remove only exact test records.
4. Turn off delivery anytime with `update public.tracking_settings set meta_enabled=false where id;`. This stops future sends. It cannot retract previously accepted events.

## Local development and tests

Node 24+. `npm ci`, `npm run dev`, `npm run build`.

`node --experimental-strip-types --test tests/tracking.test.mjs`

Runtime Sites secret: `TRACKING_BRIDGE_KEY`. Supabase stores only its SHA-256 hash in `tracking_settings.bridge_key_hash`. Generate a secure 32-byte key and rotate both sides together. Never expose the bridge key: it authorizes server operations. Local preview without runtime secrets shows a connection error rather than fabricated data.

Schema: `supabase/schema.sql` (initial empty-project schema applied remotely as `alphabet_tracking_initial`). Function: `supabase/functions/tracking-api/index.ts`. Function JWT verification is disabled because it authenticates the bridge key itself; anonymous calls are rejected. Data API access is service-role-only.

Verification performed: production build; signed identity/CSRF/GPC/consent/Event-ID unit tests; transactional SQL tests for repeat and cross-link Unique + no-consent suppression, rolled back; security advisor review (only expected deny-all RLS informational notices).

## Deployment

Sites identity is in `.openai/hosting.json`; preserve its project_id. Deploy with the Sites source/build workflow. Supabase function is deployed separately. GitHub is the source mirror requested by the owner. Deploying GitHub alone does not redeploy the hosted Worker or Edge Function.

## Schema order and verification

Apply schema.sql, lifetime.sql, reliable_delivery.sql, then retry_schedule.sql to a fresh project. Existing live project already has these migrations.

Tests: `node --experimental-strip-types --test tests/*.test.mjs`; database-only outbox assertions in `tests/outbox.sql` roll back all test rows and do not make HTTP calls. Cron job health was checked for successful scheduled runs and HTTP 200.

## Owner-requested reset

The owner said they will clear data themselves. No records were deleted during this change. Optional `supabase/reset_tracking_data.sql` clears only event/visit/identity/test data, preserves links/settings/Secrets/Vault/cron, and should only run when the owner decides to reset. This resets permanent deduplication history; existing browser IDs will count again on their next visits. It cannot clear events already sent to Meta.
