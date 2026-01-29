Covenant is a self-hosted Bitcoin inscriptions marketplace built on Cloudflare Workers. It allows artists to sell their ordinal inscriptions directly without intermediaries and includes an optional launchpad-style mint flow.

**Tech Stack:**
- Runtime: Cloudflare Workers + Durable Objects (main app worker, signing-agent worker, launchpad reservation DO)
- Database: Cloudflare D1 (SQLite)
- Caching/limits: `caches.default`, Cloudflare rate limiters for launchpad
- HTTP Framework: Hono
- Frontend: Stimulus + Turbo (Hotwire), Tailwind CSS per theme, esbuild bundling
- Bitcoin: `@scure/btc-signer` (PSBT build/sign), `sats-connect` (wallet requests; Unisat/Xverse)
- Templating: EJS compiled to JS functions in `generated/themes.js`

## Directory Structure

```
app/
├── assets/                 # Frontend assets (JS, CSS)
│   ├── javascripts/        # Stimulus controllers, Turbo, wallet models
│   └── stylesheets/        # application.<theme>.tailwind.css per theme
├── config.js               # YAML config loader with validation
├── controllers/            # HTTP request handlers
├── crons/                  # Scheduled jobs (orders, sync)
├── helpers/                # Template rendering helpers
├── models/                 # Business logic
│   └── db/                 # D1 database layer
├── themes/                 # Theme folders + theme.js renderer
├── utils/                  # Shared utilities
└── workers/
    ├── app/                # Main HTTP worker
    ├── launchpad/          # LaunchpadReservationWorker DO
    └── signing_agent/      # SigningAgentWorker DO (separate deploy)
config/
├── store.yml               # Runtime config (APIs, theme, metadata)
└── policy.yml              # Collections, prices, payment addresses
generated/                  # Build output (themes.js, assets.js) - do not edit
migrations/                 # D1 SQL migrations
public/                     # Compiled static assets (hashed JS/CSS)
scripts/                    # Build/reset scripts
wrangler.toml               # Main worker deploy config
wrangler.signing-agent.toml # Signing agent deploy config
```

## Key Commands

```bash
# Install
npm install

# Development (predev runs automatically before dev)
npm run dev                 # Main worker (default port 8787)
npm run dev:signing-agent   # Signing agent worker
npm run dev:watch           # Rebuild assets/templates on file changes

# Build pipeline (run manually or via predev/predeploy)
npm run predev              # clean + build JS + build:css + build:manifest + build:templates
npm run build               # JS bundle only (esbuild)
npm run build:css           # Tailwind CSS -> public/application.css
npm run build:manifest      # generated/assets.js (hashes CSS/JS)
npm run build:templates     # generated/themes.js (EJS -> functions)
npm run clean:assets        # Remove old hashed assets + scripts/meta.json
npm run reset:local         # Wipe .wrangler/state/v3 (D1/DO/KV/cache), reapply migrations

# Database
npx wrangler d1 migrations apply covenant --local   # Local
npx wrangler d1 migrations apply covenant --remote  # Production

# Deploy
npm run deploy:signing-agent
npm run deploy
```

Notes:
- `npm run dev` and `npm run deploy` automatically run `predev`/`predeploy`.
- Config YAML files are bundled at build time; changes require a rebuild.

## Architecture

### Workers and Durable Objects

1. **Main Worker** (`app/workers/app/index.js`)
   - Hono app serving pages + JSON endpoints.
   - Bindings: D1 `DB`, DO `LAUNCHPAD_RESERVATIONS`, DO `SIGNING_AGENT` (remote), rate limiters `LAUNCHPAD_ADDRESS_LIMITER` and `LAUNCHPAD_IP_LIMITER`.
   - Exports `LaunchpadReservationWorker` class for DO usage.

2. **Signing Agent Worker** (`app/workers/signing_agent/index.js`)
   - Separate deploy (`wrangler.signing-agent.toml`).
   - Durable Object `SigningAgentWorker` holds seller private key and signs/broadcasts transactions.
   - Env: `SELLING_WALLET_PRIVATE_KEY` (hex string, 32 bytes).

3. **Launchpad Reservation DO** (`app/workers/launchpad/worker.js`)
   - Per-collection reservation store using DO SQL (`state.storage.sql`).
   - Allocates available inscriptions, enforces reservation TTL, and calls `SIGNING_AGENT` for mint execution.

### HTTP Routes

| Route | Handler | Purpose |
|-------|---------|---------|
| `GET /` | `home_controller.js` | Collections overview |
| `GET /policy` | `policy_controller.js` | Policy page with wallet address |
| `GET /activity` | `activity_controller.js` | Transaction history |
| `GET /:collection` | `collection_controller.js` | Collection page (launchpad or standard) |
| `GET /:collection/:id` | `inscription_controller.js` | Inscription detail |
| `POST /sell/:slug` | `sell_controller.js` | Execute sale (non-launchpad only) |
| `POST /launchpad/:slug/reserve` | `launchpad_reserve_controller.js` | Reserve an inscription (launchpad) |
| `POST /launchpad/:slug/mint` | `launchpad_mint_controller.js` | Mint a reserved inscription (launchpad) |
| `GET /launchpad/:slug/sales` | `launchpad_sales_controller.js` | Recent sales fragment (Turbo frame) |
| `GET /launchpad/:slug/progress` | `launchpad_progress_controller.js` | Supply/progress fragment (Turbo frame) |

### Scheduled Jobs

- **Every 5 min**: `orders_cron.js` - Checks pending orders, rebroadcasts or confirms.
- **Every 10 min**: `sync_collections_cron.js` - Syncs owned inscriptions from Ordinals API.

## Database Schema

**orders** (D1):
- `id`, `collection_slug`, `inscription_id`, `status` (pending|confirmed|failed)
- `txid`, `signed_tx`, `extra_details` (JSON), `buyer_address`, `price_sats`
- `created_at`, `updated_at`
- Unique index on `inscription_id` where status in (pending, confirmed)

**inscription_metadata** (D1): Cached ordinals metadata
- `inscription_id`, `metadata_json`, `updated_at`

**collection_inscriptions** (D1): Available inscriptions per collection
- `collection_slug`, `inscription_id`, `sync_run_id`, `updated_at`, `metadata_json`
- Unique `(collection_slug, inscription_id)`

**reservations** (Launchpad DO storage, not D1):
- `inscription_id`, `buyer_ordinal_address`, `expires_at_ms`

## Configuration

**config/store.yml** - Runtime settings:
- `ord_api_url`: Ordinals API endpoint
- `electrs_api_url`: Electrs-compatible API (UTXOs, outspends, txs)
- `mempool_space_api_url`: Price data for USD display
- `theme`: UI theme name (must match `app/themes/<theme>` and `application.<theme>.tailwind.css`)
- `page_size`: Items per page
- Artist metadata (name, avatar, bio, socials)

**config/policy.yml** - Selling policy:
- `selling`: array of collections
- `launchpad`: optional block with `seller_address` and `collections`
- Collection fields: `slug`, `title`, `price_sats`, `payment_address`
- Collection source (choose one): `inscription_ids` or `parent_inscription_id` or `gallery_inscription_id`
- Launchpad collections also require `lowest_inscription_utxo_size`
- `optional_payments`: array of `{title, description, amount, address}`

Both YAML files are loaded and validated in `app/config.js` at build time.

## Key Models and Helpers

- **Inscription** (`app/models/inscription.js`): wraps ordinals metadata with computed properties.
- **Collection** (`app/models/collection.js`): policy lookup, pagination, availability, launchpad detection.
- **StoreWallet** (`app/models/store_wallet.js`): taproot wallet from `SELLING_WALLET_PRIVATE_KEY` (hex).
- **OrdinalsAPI** (`app/models/ordinals_api.js`): metadata + address lookups.
- **Mempool** (`app/models/mempool.js`): electrs/mempool endpoints for fees, UTXOs, outspends.
- **Exchange** (`app/models/exchange.js`): fiat price cache via mempool.space.
- **Themes** (`app/themes/theme.js`): render helpers using `generated/themes.js` + `generated/assets.js`.

## Order Flow

### Standard sale (non-launchpad)
1. User browses a standard collection and selects an inscription.
2. Frontend builds a PSBT and requests wallet signature (Unisat/Xverse via sats-connect).
3. Client POSTs signed PSBT to `/sell/:slug`.
4. Main worker forwards to `SIGNING_AGENT` DO.
5. Signing agent validates buyer/payment/inscription, signs with seller key, runs mempool test, writes `orders` row (pending), broadcasts.
6. Cron confirms or marks failed.

### Launchpad mint
1. Client POSTs `/launchpad/:slug/reserve` with `buyerOrdinalAddress` (and `turnstileToken` if enabled).
2. Launchpad DO reserves an available inscription and returns `inscriptionId`, `expiresAt`, and metadata.
3. Client builds/signs PSBT and POSTs `/launchpad/:slug/mint` with `inscriptionId` + `signedPsbt` + `buyerOrdinalAddress`.
4. Launchpad DO validates reservation, forwards to `SIGNING_AGENT` with `expectedBuyerOrdinalAddress`, and clears reservation on success.
5. Orders flow continues as above.

## Security Notes

- Seller private key only exists inside `SigningAgentWorker` DO.
- Launchpad DO stores only reservations, not keys.
- Mempool acceptance test blocks invalid txs and low fees.
- D1 unique index prevents double-selling (pending/confirmed).
- Launchpad rate limits by IP and buyer ordinal address; optional Turnstile gate.

## Development Tips

- Local state lives in `.wrangler/state/v3/` (D1/DO/KV/cache). Use `npm run reset:local` to wipe.
- `SELLING_WALLET_PRIVATE_KEY` must be a hex string (32 bytes) in `.dev.vars.signing-agent` or Wrangler secrets.
- Optional Turnstile: `TURNSTILE_CREDENTIALS=site_key:secret` in `.dev.vars.app`.
- Test scheduled jobs at `http://localhost:8787/__scheduled` (port may change if 8787 is busy).
- Launchpad UI templates exist only in the `zine` theme (`launchpad.html`, `launchpad_sales.html`, `launchpad_progress.html`). Other themes do not support launchpad pages.
- `generated/` and `public/` are build outputs; do not edit directly.

## Common Tasks

**Add a standard collection**: Edit `config/policy.yml` under `selling`, rebuild (predev) to pick up YAML changes.

**Add a launchpad collection**: Add `launchpad` block (with `seller_address`) and entry under `launchpad.collections`, including `lowest_inscription_utxo_size`. Ensure theme is `zine`.

**Change theme**: Update `config/store.yml` `theme`, ensure matching theme folder and CSS file, then run `npm run predev` (or `build:css` + `build:manifest` + `build:templates`).

**Add new route**: Create controller in `app/controllers/`, add route in `app/workers/app/index.js`.

**Modify database**: Add migration in `migrations/`, run `npx wrangler d1 migrations apply`.

## Launchpad Notes

- Buyer ordinal addresses are normalized via `normalizeOrdinalAddress` before rate limiting and reservation/mint flow.
- Turnstile reserve gate (optional) uses `TURNSTILE_CREDENTIALS=site_key:secret` and `app/utils/turnstile.js`.
- Launchpad uses Turbo frames to refresh `/launchpad/:slug/progress` and `/launchpad/:slug/sales` every 5s.
- Reservation TTL is 30s (see `RESERVATION_TIMEOUT_MS` in `app/workers/launchpad/worker.js`).
- Launchpad page and fragments use `caches.default`.
- Minting is allowed even if a reservation has technically expired; the DO only checks that a reservation row exists for the inscription and buyer.
- Reservation allocation prefers inscriptions that have never been reserved; only falls back to previously reserved ones if needed.
