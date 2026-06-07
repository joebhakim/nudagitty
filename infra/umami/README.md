# Umami Analytics

Self-hosted Umami analytics for `joeha.kim` sites. Nudagitty is the first tracked website.

## Local service

1. Create a local env file:

   ```bash
   cp infra/umami/.env.example infra/umami/.env
   ```

2. Replace both secrets:

   ```bash
   openssl rand -hex 32
   ```

3. Start the stack:

   ```bash
   cd infra/umami
   docker compose up -d
   ```

4. Open `http://127.0.0.1:8505`. A fresh Umami install starts as `admin` / `umami`; change that password before exposing the service.

This checkout has already had the default admin password rotated. The generated local credential is in `infra/umami/.admin-password`, which is ignored by git.

## Public route

Add the analytics host to the Cloudflare Tunnel config:

```yaml
- hostname: analytics.joeha.kim
  service: http://127.0.0.1:8505
```

Then restart `cloudflared`.

## App build configuration

Create `apps/web/.env.production.local` with the website ID from Umami:

```env
VITE_UMAMI_SRC=https://analytics.joeha.kim/script.js
VITE_UMAMI_WEBSITE_ID=<website-id>
VITE_UMAMI_DOMAINS=nudag.joeha.kim
```

Vite reads these at build time, so rebuild/redeploy Nudagitty after changing them.

This checkout has already created the `Nudagitty` website entry in Umami and populated `apps/web/.env.production.local`, which is ignored by git.

The Umami dashboard is at `https://analytics.joeha.kim/websites`; add future sites there and give each site its own website ID while reusing the same tracker host.

The tracker is configured by the app to exclude URL search strings and hashes. Custom events must stay coarse and must not include graph text, compact-link payloads, node labels, edge IDs, or free-form user input.
