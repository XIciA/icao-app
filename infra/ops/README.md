# Ops console deployment draft

This directory is repository-only deployment scaffolding for the isolated
operations console. It does not change the frozen user Web/Vercel project and
must not be applied from this task branch.

Production rollout prerequisites:

1. Merge the reviewed code and migration into `origin/main`; back up PostgreSQL
   and rehearse the complete pending migration suffix on an isolated copy.
2. Build and run the dedicated Ops API image, not the ordinary user API image.
   The ordinary API stays on host port `3101`; the Ops API is a separate
   process/container published only as `127.0.0.1:3102`. The ordinary
   `AppModule` does not register `/v1/admin/*`, even if Ops secrets are
   accidentally present in its environment. Keep all Ops secrets exclusively
   in `/opt/icao/runtime/ops-api/.env` and configure `OPS_ENABLED=1`, a unique
   `OPS_SESSION_HASH_SECRET`, and a 32-byte base64
   `OPS_TOTP_ENCRYPTION_KEY`. Also configure a unique 32+ character
   `OPS_TRUSTED_PROXY_SHARED_SECRET` in both the Ops API secret file and the
   host Caddy environment. Keep these values in the server secret manager only.
   The complete allowlist is documented in `ops-api.env.example`: database URL,
   runtime/release identity, account identity hash secret, and Ops-only fields.
   This container must not receive Supabase, Apple, AI, content-signing, invite,
   or SMS credentials; `loadOpsConfig` neither parses nor returns those fields.
3. Provision the first administrator only after migration rehearsal. Run
   `pnpm --filter @icao/api ops:staff:provision` on the server with either a
   private `OPS_PROVISION_INPUT_FILE` (absolute path, mode `0600`, JSON fields
   `email`, `password`, and `role`) or the equivalent `OPS_PROVISION_EMAIL`,
   `OPS_PROVISION_PASSWORD`, and `OPS_PROVISION_ROLE` process environment.
   `OPS_PROVISION_OUTPUT_FILE` is mandatory, must be an absolute path outside
   the repository in a non-writable-by-others directory, and must not already
   exist. The command writes the TOTP secret and recovery codes once to that
   new mode-`0600` file and prints no credentials. Duplicate email creation is
   rejected. Import the TOTP material into the company password manager, split
   recovery-code custody as required, verify login, then securely remove the
   input and delivery files. Never redirect the file contents into logs/chat.
4. Build `infra/ops/Dockerfile` and `infra/ops/Dockerfile.api`, bind both
   containers to localhost, and
   merge the example host into the ECS gateway only after access controls,
   TLS, backup, restore, and rollback checks pass.
5. Route only `/v1/admin/*` to the dedicated Ops API on `3102`; never route it
   to the ordinary API on `3101`. Caddy overwrites `X-Ops-Client-IP` and
   `X-Ops-Proxy-Secret`; the Ops process has Fastify generic proxy trust disabled
   and accepts that client address only from a loopback peer with the shared
   secret. The browser must never receive database credentials, proxy secrets,
   or connect to PostgreSQL directly.

The example keeps the SPA and dedicated admin API same-origin. The Ops process
fails closed while `OPS_ENABLED` or any independent secret is absent. Worker
sessions expire after 12 hours, stay in browser session storage, and are
revocable server-side. Web and Ops API have independent images and containers;
neither is part of the user API container, so their build or runtime failure
does not stop user login, learning, payment verification, entitlements, AI, or
cleanup jobs.

Login anti-abuse for 1.0 is intentionally small and explicit: each Ops API
instance holds an in-memory fixed-window limiter capped at 4,096 source buckets,
with 8 attempts per source per 10 minutes and 200 total attempts per minute.
The gate runs before database lookup, password scrypt, and login-failure audit.
Expired buckets are pruned and new buckets are rejected at capacity; no
unbounded rate-limit table exists. Unknown emails perform only rate-limited
dummy scrypt and never create immutable audit rows. Known-account failures are
audited only after passing the gate. This assumes a single Ops API instance for
1.0; before horizontal scaling, replace it with a shared bounded limiter or add
an equivalent source limit at the trusted gateway.

The first release provisions exactly one company-owner administrator. New staff
remain a server-only operation via `ops:staff:provision`: TOTP and recovery
materials must be delivered once through the mode-`0600` file and must never be
shown in the Web page. Later support/admin creation uses the same audited server
flow. The page can list and disable staff or revoke their sessions; the service
blocks self-disable and disabling the final active administrator.
