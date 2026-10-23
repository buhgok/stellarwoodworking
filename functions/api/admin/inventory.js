// GET  /api/admin/inventory: every product (including hidden ones) with stock and sales.
// POST /api/admin/inventory: { id, available?, shipping?: { first, additional } } updates stock and/or shipping.
import { available, catalog, json, shippingFor, soldCount } from "../../_shared/shop.js";

export async function onRequestGet({ env }) {
  const products = await Promise.all(
    catalog.products.map(async (p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      active: p.active !== false,
      unique: Number(p.quantity) === 1,
      available: await available(env, p),
      sold: await soldCount(env, p.id),
      shippable: p.shippable !== false,
      shipping: await shippingFor(env, p),
    }))
  );
  return json({ tracking: Boolean(env.INVENTORY), freeOver: catalog.shipping?.freeOver ?? null, products });
}

export async function onRequestPost({ request, env }) {
  if (!env.INVENTORY) return json({ error: "Stock tracking (INVENTORY) isn't set up." }, 503);
  const body = await request.json().catch(() => null);
  const product = catalog.products.find((p) => p.id === body?.id);
  if (!product) return json({ error: "Unknown product." }, 404);

  const money = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && v !== "" && v !== null;
  if (body.shipping !== undefined) {
    const { first, additional } = body.shipping || {};
    if (!money(first) || !money(additional)) return json({ error: "Shipping must be a dollar amount, 0 or more." }, 400);
  }
  if (body.available !== undefined && (!Number.isInteger(Number(body.available)) || Number(body.available) < 0)) {
    return json({ error: "Stock must be a whole number, 0 or more." }, 400);
  }

  if (body.available !== undefined) await env.INVENTORY.put(`stock:${product.id}`, String(Number(body.available)));
  if (body.shipping !== undefined) {
    const round = (v) => Math.round(Number(v) * 100) / 100;
    await env.INVENTORY.put(
      `ship:${product.id}`,
      JSON.stringify({ first: round(body.shipping.first), additional: round(body.shipping.additional) })
    );
  }
  return json({ id: product.id, available: await available(env, product), shipping: await shippingFor(env, product) });
}
