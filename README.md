# Covenant

Be your own inscriptions marketplace

## Config

- `config/store.yml`: runtime config (theme, Electrs API URL, artist metadata)
- `config/policy.yml`: selling, launchpad, and buying policies
- `config/collections.json`: local copy of the shared collection catalog from `TheWizardsOfOrd/ordinals-collections`

Buy and sell policies should use `catalog_slug` whenever the collection exists in `config/collections.json`.
Use explicit `parent_inscription_id`, `gallery_inscription_id`, or `inscription_ids` only for true one-off policies that are not in the shared catalog.

Refresh the local catalog with:

```bash
npm run sync:collections
```

## Local

```bash
npm install
printf "SELLING_WALLET_PRIVATE_KEY=...\n" > .dev.vars.signing-agent
printf "FUNDING_WALLET_PRIVATE_KEY=...\n" > .dev.vars.buy-agent
: > .dev.vars.app
npx wrangler@latest d1 migrations apply covenant --local
npm run dev:signing-agent
npm run dev:buy-agent
npm run dev
```

Optional (second terminal):

```bash
npm run dev:watch
```

Trigger a scheduled run in the browser (scheduled crons must be enabled via `npm run dev`):

- `http://localhost:8787/__scheduled`

## Production

```bash
npx wrangler@latest d1 create covenant
npx wrangler@latest d1 list
npx wrangler@latest d1 migrations apply covenant --remote
npx wrangler@latest secret put SELLING_WALLET_PRIVATE_KEY --config wrangler.signing-agent.toml
npx wrangler@latest secret put FUNDING_WALLET_PRIVATE_KEY --config wrangler.buy-agent.toml
npm run deploy:signing-agent
npm run deploy:buy-agent
npm run deploy
```

Ensure the D1 `database_id` in `wrangler.toml`, `wrangler.signing-agent.toml`, and `wrangler.buy-agent.toml` matches the database you created.

## Crons

Configured in `wrangler.toml` (orders every 5 min, sync every 10 min).
