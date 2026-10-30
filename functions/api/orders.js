// POST /api/orders: holds the pieces in WOOD, then builds a PayPal order from
// WOOD's prices and totals.
// Body: { items: [{ id, qty }], delivery: "ship" | "pickup" }
import { failureReason, json, paypalFetch, wood } from "../_shared/shop.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items)
    ? body.items.map((item) => ({ listing_id: String(item?.id ?? ""), qty: item?.qty }))
    : [];

  let hold;
  try {
    hold = await wood(env, "website_hold_items", { p_items: items, p_delivery: body?.delivery ?? null });
  } catch (err) {
    console.error(err);
    return json({ error: "Checkout isn't available right now.", reason: failureReason(err) }, 503);
  }
  if (!hold.ok) return json({ error: hold.message, code: hold.code }, 409);

  const currency_code = hold.currency;
  const order = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: hold.hold_id,
        description: `Stellar Woodworking order (${hold.delivery === "ship" ? "shipping" : "local pickup"})`,
        amount: {
          currency_code,
          value: hold.total,
          breakdown: {
            item_total: { currency_code, value: hold.item_total },
            shipping: { currency_code, value: hold.shipping_total },
          },
        },
        items: hold.lines.map((l) => ({
          name: l.name.slice(0, 127),
          sku: l.listing_id,
          quantity: String(l.qty),
          unit_amount: { currency_code, value: l.unit_price },
          category: "PHYSICAL_GOODS",
        })),
      },
    ],
    application_context: {
      brand_name: "Stellar Woodworking",
      shipping_preference: hold.delivery === "ship" ? "GET_FROM_FILE" : "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  try {
    const res = await paypalFetch(env, "/v2/checkout/orders", { method: "POST", body: JSON.stringify(order) });
    if (res.ok) return json({ id: res.data.id });
    console.error("PayPal create order failed", res.status, JSON.stringify(res.data));
  } catch (err) {
    console.error(err);
  }

  // PayPal didn't take the order, so free the pieces right away.
  await wood(env, "website_release_hold", { p_hold_id: hold.hold_id }).catch((err) => console.error(err));
  return json({ error: "We couldn't start checkout. Please try again." }, 502);
}
