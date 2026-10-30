// POST /api/orders/:id/cancel: the shopper closed or cancelled PayPal, so
// release the pieces held for this checkout.
import { holdIdFrom, isPayPalOrderId, json, paypalFetch, wood } from "../../../_shared/shop.js";

export async function onRequestPost({ params, env }) {
  const id = String(params.id || "");
  if (!isPayPalOrderId(id)) return json({ error: "Invalid order." }, 400);

  try {
    const order = await paypalFetch(env, `/v2/checkout/orders/${id}`);
    const holdId = order.ok ? holdIdFrom(order.data) : null;
    if (holdId && order.data.status !== "COMPLETED") {
      await wood(env, "website_release_hold", { p_hold_id: holdId });
    }
  } catch (err) {
    // Holds expire on their own, so a failed release is not shown to the shopper.
    console.error(err);
  }
  return json({ ok: true });
}
