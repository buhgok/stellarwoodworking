# stellarwoodworking
Website for Stellar Woodworking

## Shop

Products live in `products.json`. Each product has an `id` (never change it once sold), `name`,
`description`, `price` (USD), `quantity` (1 = one-of-a-kind), `image` (e.g. `assets/shop/board.jpg`),
`shippable` (false = local pickup only) and `active` (false hides it). Shipping and pickup settings are at the top.

Checkout runs through Cloudflare Pages Functions in `functions/api/` and PayPal. Cloudflare Pages settings:

- **Variables and Secrets**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (secret), and `PAYPAL_ENV=live`
  for production only. Without `PAYPAL_ENV=live`, the PayPal sandbox is used.
- **Bindings**: a KV namespace bound as `INVENTORY`. It records sold quantities; without it, stock isn't tracked.

To restock an item, raise its `quantity` in `products.json` (sold counts are subtracted from it).
