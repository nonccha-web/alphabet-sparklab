# Alphabet Sparklab

Public aggregate dashboard and consent-gated Meta Pixel/CAPI tracking on the **three original Alphabet Facade website URLs**.

**Website developer handoff: [คู่มือติดตั้งภาษาไทย](integration/INSTALL_TH.md)**

Upload [alphabet-tracking.js](integration/alphabet-tracking.js) to the existing website and add one deferred script tag. Use CMP mode when the website already has a consent manager. No Meta or Supabase secret belongs in frontend source.

| Exact page URL | Exact custom event |
|---|---|
| https://www.alphabetfacade.com/request-quotation.html | Request Quotation |
| https://www.alphabetfacade.com/project-start.html | Project Start |
| https://www.alphabetfacade.com/facade-care.html | Facade Care |

Pixel ID: `1038711025904592`. Supabase: `hvrclmycmpgmnpwyzznw`.

## Deployment status and boundaries

The dashboard/collector are prepared separately from the customer's website. The website developer must install the SDK and wire consent before original-page visits can be tracked. Existing `/t/*` gateway routes return 410 and never record visits. Do not use them in ads.

The SDK records after page loading begins. It does not intercept the initial website HTTP request; strict server-before-page tracking would require reverse proxy or server middleware. Counts reflect successfully recorded script visits, not guaranteed human clicks or all server requests.

The existing dashboard is hosted at https://alphabet-sparklab-tracking.siraphobice1995.chatgpt.site . The personal namespace is a Sites hosting identity, unrelated to GitHub/Supabase ownership. It has not been renamed. A custom domain can remove it after the owner selects a hostname and configures DNS. Customer page URLs stay unchanged and do not redirect through this host.

## Architecture

- Self-hosted `integration/alphabet-tracking.js`: exact origin/path allowlist, first-party cookie UUID, one unique visit ID per load; retries reuse that visit ID. No IP identity or OS filtering. Original URL query strings are discarded.
- Public Supabase `website-tracking`: allowlisted browser Origin/page; signed one-hour ticket required for consent and browser-dispatch acknowledgement. Public ingestion is not an authentication boundary or proof of a human visit. Database access uses service_role only inside the Edge Function.
- Consent unknown/denied/GPC never dispatches Meta through this integration. CMP mode waits for explicit marketing state; standalone mode provides allow/deny and settings reopening. Other preexisting scripts must be controlled by the site's CMP too.
- PostgreSQL transaction/advisory-lock dedup is permanent per visitor UUID + Link. Browser cookies may expire or be erased, so identity is not perpetual or cross-device. Unique totals sum per-link first occurrences, not distinct humans across all links.
- One event per permanent unique once consent is granted. Browser `trackSingleCustom` and CAPI share event_name + event_id. No automatic PageView. Remove duplicate custom event emitters for these names.
- CAPI outbox retries transient failures with original event_id/name/time, at most 10 attempts within 47 hours. Minute cron, exponential backoff to one hour, row/lease locking, stale send recovery after two minutes. Permanent validation/auth failures stop. Retry key is held in Vault and restricted to retry action.
- Private `tracking-api` authenticates the server bridge key and exposes aggregated statistics/retry operations. Dashboard only displays aggregates; raw visitor data, secrets and admin writes are not public. RLS denies anon/authenticated table/RPC access.
- `Meta accepted` means CAPI API acknowledgement, not attributed conversions or proof of Meta browser/server dedup. `browser_dispatched_at` only means local library dispatch. Final browser/Meta verification needs installation and authorized Events Manager access.
- Initial 5 setup visits / 3 events remain tagged test and excluded from live reports. No data was deleted. Those original setup events were real CAPI submissions; DB cleanup cannot remove them from Meta.

## Runtime configuration

Sites secret: `TRACKING_BRIDGE_KEY`; private DB stores its SHA-256 hash. Supabase runtime secret: `META_CAPI_ACCESS_TOKEN`; optional `META_TEST_EVENT_CODE` applies only to visits marked is_test. Built-in `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` remain server-only.

Supabase functions: deploy `tracking-api/index.ts` + delivery.ts; deploy `website-tracking/index.ts` + handler.ts + relative tracking-api/delivery.ts dependency. Both use `verify_jwt=false`: private API authenticates bridge/retry key; public collector's initial visit is public, subsequent consent/ack require signed ticket. Do not expose admin/stats routes in public collector.

Existing schema migrations are already applied: `supabase/schema.sql`, `lifetime.sql`, `reliable_delivery.sql`, `retry_schedule.sql`. No new schema migration is required for the website SDK.

## Development and verification

Node 24+, `npm ci`, `npm run dev`, `npm run build`.

```sh
node --experimental-strip-types --test tests/*.test.mjs
```

Collector tests use in-memory mocks, not real Meta requests. Transactional DB assertions in `tests/outbox.sql` roll back test rows. Real website integration and Meta dedup must be verified after Dev installs the script; see Thai checklist. Do not assume a successful build proves installation.

Sites project is pinned in `.openai/hosting.json`. Preserve its project_id and use the Sites source/build/save/deploy workflow. GitHub is the requested source repository; a GitHub push alone does not redeploy Sites or Supabase.

## Optional owner data reset

`supabase/reset_tracking_data.sql` is provided but was not executed. It clears events/visits/unique/test data, preserves settings/links/secrets/Vault/cron, and resets permanent dedup history. The owner decides when to run it. It cannot reset Meta data.
