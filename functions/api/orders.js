// POST /api/orders: builds a PayPal order from server-side prices.
// Body: { items: [{ id, qty }], delivery: "ship" | "pickup" }
import { catalog, json, paypalFetch, priceCart, toValue } from "../_shared/shop.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const cart = await priceCart(env, body?.items, body?.delivery);
  if (cart.error) return json({ error: cart.error }, 400);

  const currency_code = catalog.currency;
  const order = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: body.delivery,
        description: `Stellar Woodworking order (${body.delivery === "ship" ? "shipping" : "local pickup"})`,
        amount: {
          currency_code,
          value: toValue(cart.totalCents),
          breakdown: {
            item_total: { currency_code, value: toValue(cart.itemCents) },
            shipping: { currency_code, value: toValue(cart.shippingCents) },
          },
        },
        items: cart.lines.map((l) => ({
          name: l.product.name.slice(0, 127),
          sku: l.product.id,
          quantity: String(l.qty),
          unit_amount: { currency_code, value: toValue(l.unitCents) },
          category: "PHYSICAL_GOODS",
        })),
      },
    ],
    application_context: {
      brand_name: "Stellar Woodworking",
      shipping_preference: body.delivery === "ship" ? "GET_FROM_FILE" : "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  try {
    const res = await paypalFetch(env, "/v2/checkout/orders", { method: "POST", body: JSON.stringify(order) });
    if (!res.ok) {
      console.error("PayPal create order failed", res.status, JSON.stringify(res.data));
      return json({ error: "We couldn't start checkout. Please try again." }, 502);
    }
    return json({ id: res.data.id });
  } catch (err) {
    console.error(err);
    return json({ error: "Checkout isn't available right now." }, 503);
  }
}
