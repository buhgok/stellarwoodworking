// Shared helpers for the shop API (Cloudflare Pages Functions).
//
// Environment (Pages > Settings > Variables and Secrets):
//   PAYPAL_CLIENT_ID      PayPal REST app client ID
//   PAYPAL_CLIENT_SECRET  PayPal REST app secret (store as a secret)
//   PAYPAL_ENV            "live" for real payments; anything else uses sandbox
// Bindings (Pages > Settings > Bindings):
//   INVENTORY             KV namespace used to track sold quantities

import catalog from "../../products.json";

export { catalog };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const toCents = (dollars) => Math.round(Number(dollars) * 100);
export const toValue = (cents) => (cents / 100).toFixed(2);

export function findProduct(id) {
  return catalog.products.find((p) => p.id === id && p.active !== false);
}

export async function soldCount(env, id) {
  if (!env.INVENTORY) return 0;
  return Number((await env.INVENTORY.get(`sold:${id}`)) || 0);
}

export async function available(env, product) {
  return Math.max(0, Number(product.quantity || 0) - (await soldCount(env, product.id)));
}

// Validates cart lines against the catalog and stock. Returns { lines } or { error }.
export async function priceCart(env, items, delivery) {
  if (!Array.isArray(items) || items.length === 0) return { error: "Your cart is empty." };
  if (delivery !== "ship" && delivery !== "pickup") return { error: "Choose shipping or pickup." };
  if (delivery === "pickup" && !catalog.pickup?.enabled) return { error: "Local pickup isn't available." };

  const lines = [];
  for (const item of items) {
    const product = findProduct(item?.id);
    const qty = Number(item?.qty);
    if (!product) return { error: "An item in your cart is no longer available." };
    if (!Number.isInteger(qty) || qty < 1) return { error: `Invalid quantity for ${product.name}.` };
    if (delivery === "ship" && product.shippable === false) {
      return { error: `${product.name} is available for local pickup only.` };
    }
    const left = await available(env, product);
    if (qty > left) {
      return { error: left ? `Only ${left} of ${product.name} left.` : `${product.name} has sold out.` };
    }
    lines.push({ product, qty, unitCents: toCents(product.price) });
  }

  const itemCents = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);
  const { flatRate = 0, freeOver } = catalog.shipping || {};
  const freeShipping = freeOver != null && itemCents >= toCents(freeOver);
  const shippingCents = delivery === "ship" && !freeShipping ? toCents(flatRate) : 0;
  return { lines, itemCents, shippingCents, totalCents: itemCents + shippingCents };
}

export function paypalBase(env) {
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
