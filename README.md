# stellarwoodworking
Website for Stellar Woodworking

## Shop

Products live in `products.json`. Each product has an `id` (never change it once sold), `name`,
`description`, `price` (USD), `quantity` (starting stock; 1 = one-of-a-kind), `image` (e.g. `assets/shop/board.jpg`),
`shippable` (false = local pickup only) and `active` (false hides it). Shipping and pickup settings are at the top.

Checkout runs through Cloudflare Pages Functions in `functions/api/` and PayPal. Cloudflare Pages settings:

- **Variables and Secrets**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (secret), `ADMIN_PASSWORD` (secret),
  and `PAYPAL_ENV=live` for production only. Without `PAYPAL_ENV=live`, the PayPal sandbox is used.
- **Bindings**: a KV namespace bound as `INVENTORY`. It stores stock levels and orders; without it, stock isn't tracked.

## Admin

`/admin` (username `admin`, password = `ADMIN_PASSWORD`) shows stock and orders. Stock you set there
overrides `quantity` in `products.json`; sales count it down automatically. Orders can be marked shipped / picked up.
