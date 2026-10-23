// GET  /api/admin/inventory: every product (including hidden ones) with stock and sales.
// POST /api/admin/inventory: { id, available } sets how many are in stock.
import { available, catalog, json, soldCount } from "../../_shared/shop.js";

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
    }))
  );
  return json({ tracking: Boolean(env.INVENTORY), products });
}

export async function onRequestPost({ request, env }) {
  if (!env.INVENTORY) return json({ error: "Stock tracking (INVENTORY) isn't set up." }, 503);
  const body = await request.json().catch(() => null);
  const product = catalog.products.find((p) => p.id === body?.id);
  const count = Number(body?.available);
  if (!product) return json({ error: "Unknown product." }, 404);
  if (!Number.isInteger(count) || count < 0) return json({ error: "Stock must be a whole number, 0 or more." }, 400);
  await env.INVENTORY.put(`stock:${product.id}`, String(count));
  return json({ id: product.id, available: count });
}
