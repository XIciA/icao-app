# ICAO public HTTPS gateway

This gateway is the only public HTTP/HTTPS entry point for the transitional
standalone-device runtime:

- `api.readyoufife.com` proxies to the host-only API listener on `127.0.0.1:3101`.
- `cloud.readyoufife.com` proxies to the host-only Supabase Kong listener on
  `127.0.0.1:8000`.
- `ops.readyoufife.com` proxies only its admin API and health routes to the
  host-only Ops API on `127.0.0.1:3102`; its remaining routes go to the
  host-only Ops static server on `127.0.0.1:4180`.
- The production gateway intentionally exposes no user website or APK download
  host. The internal Ops site is deployed only through the reviewed Ops release
  chain and is unrelated to the frozen Vercel site or EdgeOne user Web.

The gateway uses host networking so that the Caddy container can reach listeners
that intentionally remain bound to the ECS loopback interface. Database, Studio,
Mailpit, Kong, and API ports must not be opened directly in the security group.

## Deploy

The Ops release flow owns production changes to this gateway because it must
atomically coordinate the dedicated upstreams, the server-held proxy secret,
TLS verification, and rollback. See `infra/ops/README.md`.

For a gateway-only recovery, first restore its previously protected Caddyfile,
Compose file, and root-owned mode-`0600` `.env`, validate the Caddyfile, then
start it with:

```sh
docker compose -f /opt/icao/runtime/gateway/docker-compose.yml config
docker run --rm \
  --env-file /opt/icao/runtime/gateway/.env \
  -v /opt/icao/runtime/gateway/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2.11.4-alpine caddy validate --config /etc/caddy/Caddyfile
docker compose -f /opt/icao/runtime/gateway/docker-compose.yml up -d
```

If Docker Hub is unreachable from the ECS, pull the same pinned image through
the current China mirror and keep the local image name expected by Compose:

```sh
docker pull docker.m.daocloud.io/library/caddy:2.11.4-alpine
docker tag docker.m.daocloud.io/library/caddy:2.11.4-alpine caddy:2.11.4-alpine
```

## Verify

Verify all public certificates and representative upstream routes. Also confirm
that `3101`, `3102`, `4180`, `8000`, database, Studio, and Mailpit remain
loopback-only. Never print or copy the gateway `.env` into logs.

## Roll back

Stop the gateway with:

```sh
docker compose -f /opt/icao/runtime/gateway/docker-compose.yml down
```

If public Supabase/API URLs have already been switched, restore the protected
environment-file backups before restarting the affected containers.
