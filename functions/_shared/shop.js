// Shared helpers for the shop API (Cloudflare Pages Functions).
//
// The shop's products, stock, prices, holds, and orders live in WOOD.
// These functions call WOOD's website_* operations (see WOOD's
// docs/website-contract.md) and talk to PayPal.
//
// Environment (Pages > Settings > Variables and Secrets):
//   WOOD_URL              WOOD Supabase project URL, e.g. https://abc.supabase.co
//   WOOD_PUBLISHABLE_KEY  WOOD Supabase publishable (anon) key
//   WOOD_WEBSITE_KEY      Website key from WOOD's website_rotate_key() (store as a secret)
//   PAYPAL_CLIENT_ID      PayPal REST app client ID
//   PAYPAL_CLIENT_SECRET  PayPal REST app secret (store as a secret)
//   PAYPAL_ENV            "live" for real payments; anything else uses sandbox
//   PAYPAL_API_BASE       Testing only: overrides the PayPal API address
// Bindings (optional):
//   INVENTORY             KV namespace; only used to park a paid order that
//                         could not be recorded in WOOD (unrecorded:<capture>)

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Calls a WOOD website_* operation with the website key. Returns WOOD's JSON
// response, which has ok: true or ok: false with a shopper-facing message.
// Throws when WOOD can't be reached, rejects the key, or the call fails.
export async function wood(env, operation, args = {}) {
  if (!env.WOOD_URL || !env.WOOD_PUBLISHABLE_KEY || !env.WOOD_WEBSITE_KEY) {
    throw new Error("WOOD connection is not configured.");
  }
  const res = await fetch(`${env.WOOD_URL.replace(/\/+$/, "")}/rest/v1/rpc/${operation}`, {
    method: "POST",
    headers: {
      apikey: env.WOOD_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_key: env.WOOD_WEBSITE_KEY, ...args }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WOOD ${operation} failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

// Product photos in WOOD are bucket paths, site paths ("/assets/..."), or full URLs.
export function photoUrl(env, path) {
  if (/^https:\/\//.test(path) || path.startsWith("/")) return path;
  return `${env.WOOD_URL.replace(/\/+$/, "")}/storage/v1/object/public/product-photos/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function paypalBase(env) {
  if (env.PAYPAL_API_BASE) return env.PAYPAL_API_BASE;
  return env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export async function paypalFetch(env, path, init = {}) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured.");
  }
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const tokenRes = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error(`PayPal auth failed (${tokenRes.status}).`);
  const { access_token } = await tokenRes.json();

  const res = await fetch(`${paypalBase(env)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// The WOOD checkout hold ID is stored as the PayPal order's custom_id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function holdIdFrom(paypalOrder) {
  const id = paypalOrder?.purchase_units?.[0]?.custom_id;
  return UUID.test(id || "") ? id : null;
}

export const isPayPalOrderId = (id) => /^[A-Z0-9]{5,40}$/.test(id);
