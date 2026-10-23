# stellarwoodworking
Website for Stellar Woodworking

## Shop

Products live in `products.json`. Each product has an `id` (never change it once sold), `name`,
`description`, `details` (small specs line), `price` (USD), `quantity` (starting stock; 1 = one-of-a-kind),
`images` (list of photos in `assets/shop/`, first one shown first),
`shippingCost` / `shippingAdditional` (default shipping; admin page overrides), `shippable` (false = local pickup only) and `active` (false hides it). Shipping and pickup settings are at the top.

Checkout runs through Cloudflare Pages Functions in `functions/api/` and PayPal. Cloudflare Pages settings:

- **Variables and Secrets**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (secret), `ADMIN_PASSWORD` (secret),
  and `PAYPAL_ENV=live` for production only. Without `PAYPAL_ENV=live`, the PayPal sandbox is used.
- **Bindings**: a KV namespace bound as `INVENTORY`. It stores stock levels and orders; without it, stock isn't tracked.

## Admin

`/admin` (username `admin`, password = `ADMIN_PASSWORD`) shows prices, stock, shipping and orders. Price and stock set there
override `price` and `quantity` in `products.json`; sales count it down automatically. Orders can be marked shipped / picked up.
Shipping per product is also set there: the costliest item ships at its full Shipping rate and every other
item adds its Each additional rate. `shipping.freeOver` in `products.json` (a dollar amount, or `null` for off) makes larger orders ship free.
