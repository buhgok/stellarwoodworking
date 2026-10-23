// GET  /api/admin/orders: completed orders, newest first.
// POST /api/admin/orders: { id, fulfilled } marks an order shipped / picked up.
import { json } from "../../_shared/shop.js";

export async function onRequestGet({ env }) {
  if (!env.INVENTORY) return json({ orders: [] });
  const keys = [];
  let cursor;
  do {
    const page = await env.INVENTORY.list({ prefix: "order:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  const orders = await Promise.all(
    keys.map(async ({ name }) => ({ id: name.slice(6), ...(await env.INVENTORY.get(name, "json")) }))
  );
  orders.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return json({ orders });
}

export async function onRequestPost({ request, env }) {
  if (!env.INVENTORY) return json({ error: "Stock tracking (INVENTORY) isn't set up." }, 503);
  const body = await request.json().catch(() => null);
  const key = `order:${body?.id}`;
  const order = await env.INVENTORY.get(key, "json");
  if (!order) return json({ error: "Order not found." }, 404);
  order.fulfilled = Boolean(body.fulfilled);
  await env.INVENTORY.put(key, JSON.stringify(order), { metadata: { at: order.at, fulfilled: order.fulfilled } });
  return json({ id: body.id, fulfilled: order.fulfilled });
}
