// POST /api/orders/:id/capture: re-checks stock, captures payment, then records the sale.
import { available, findProduct, json, paypalFetch, soldCount } from "../../../_shared/shop.js";

export async function onRequestPost({ params, env }) {
  const id = String(params.id || "");
  if (!/^[A-Z0-9]+$/.test(id)) return json({ error: "Invalid order." }, 400);

  try {
    const order = await paypalFetch(env, `/v2/checkout/orders/${id}`);
    if (!order.ok) return json({ error: "Order not found." }, 404);
    const items = order.data.purchase_units?.[0]?.items || [];

    // Another buyer may have bought a one-of-a-kind piece since this order was created.
    for (const item of items) {
      const product = findProduct(item.sku);
      if (!product || Number(item.quantity) > (await available(env, product))) {
        return json({ error: `Sorry, ${item.name} just sold out. You have not been charged.` }, 409);
      }
    }

    const capture = await paypalFetch(env, `/v2/checkout/orders/${id}/capture`, { method: "POST", body: "{}" });
    if (!capture.ok) {
      console.error("PayPal capture failed", capture.status, JSON.stringify(capture.data));
      const declined = capture.data?.details?.some((d) => d.issue === "INSTRUMENT_DECLINED");
      return json({ error: declined ? "Your payment was declined." : "Payment couldn't be completed.", declined }, 422);
    }

    if (env.INVENTORY && !(await env.INVENTORY.get(`order:${id}`))) {
      await env.INVENTORY.put(`order:${id}`, JSON.stringify({ at: new Date().toISOString(), items }));
      for (const item of items) {
        const sold = (await soldCount(env, item.sku)) + Number(item.quantity);
        await env.INVENTORY.put(`sold:${item.sku}`, String(sold));
      }
    }

    return json({
      id,
      status: capture.data.status,
      name: capture.data.payer?.name?.given_name || "",
      email: capture.data.payer?.email_address || "",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Checkout isn't available right now." }, 503);
  }
}
