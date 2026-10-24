# stellarwoodworking
Website for Stellar Woodworking

## Shop

The shop runs on WOOD, Stellar Woodworking's internal system. Products, photos, prices, stock, shipping rates,
pickup settings, and orders are all managed in WOOD; this site only displays them and takes payment.
The agreement between the two systems is `docs/website-contract.md` in the WOOD repository.

Each physical board in WOOD has its own price. The shop lists a product once per price, with the number of
boards available at that price. A product marked one-of-a-kind in WOOD shows as "One of a kind".

Checkout runs through Cloudflare Pages Functions in `functions/api/` and PayPal:

1. `GET /api/products` reads the catalog from WOOD.
2. `POST /api/orders` asks WOOD to hold the boards for 20 minutes and price the cart, then creates the PayPal order
   from WOOD's totals.
3. `POST /api/orders/:id/capture` confirms the hold, captures the payment, and records the paid order in WOOD.
4. `POST /api/orders/:id/cancel` releases the boards when the shopper cancels PayPal.

Paid orders appear in WOOD's Orders and Fulfillment screens.

### Cloudflare Pages settings

**Variables and Secrets:**

| Name | Value |
|---|---|
| `WOOD_URL` | WOOD's Supabase Project URL |
| `WOOD_PUBLISHABLE_KEY` | WOOD's Supabase publishable (anon) key |
| `WOOD_WEBSITE_KEY` | The restricted website credential from WOOD (secret) |
| `PAYPAL_CLIENT_ID` | PayPal REST app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal REST app secret (secret) |
| `PAYPAL_ENV` | `live` for production only; anything else uses the PayPal sandbox |

Never put WOOD's Supabase secret / `service_role` key here.

**Bindings (optional):** a KV namespace bound as `INVENTORY`. It is used only if a payment succeeds but WOOD can't
be reached to record it after three tries: the order is saved under `unrecorded:<PayPal capture ID>` so it can be
entered into WOOD by hand. Check the Functions logs for "UNRECORDED PAID ORDER".
