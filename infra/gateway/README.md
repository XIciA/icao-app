# ICAO public HTTPS gateway

This gateway is the only public HTTP/HTTPS entry point for the transitional
standalone-device runtime:

- `api.feizhuicao.com` proxies to the host-only API listener on `127.0.0.1:3101`.
- `cloud.feizhuicao.com` proxies to the host-only Supabase Kong listener on
  `127.0.0.1:8000`.
- `download.feizhuicao.com` serves the noindex Android download page and APKs
  from `/opt/icao/runtime/downloads/android`.

The gateway uses host networking so that the Caddy container can reach listeners
that intentionally remain bound to the ECS loopback interface. Database, Studio,
Mailpit, Kong, and API ports must not be opened directly in the security group.

## Deploy

Copy this directory to `/opt/icao/runtime/gateway`, validate the Caddyfile, then
start it with:

```sh
docker compose -f /opt/icao/runtime/gateway/docker-compose.yml config
docker run --rm \
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

Verify both public certificates and representative upstream routes. Also confirm
that `3101`, `8000`, database, Studio, and Mailpit remain loopback-only.

## Roll back

Stop the gateway with:

```sh
docker compose -f /opt/icao/runtime/gateway/docker-compose.yml down
```

If public Supabase/API URLs have already been switched, restore the protected
environment-file backups before restarting the affected containers.
