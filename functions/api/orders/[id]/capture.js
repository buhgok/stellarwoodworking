// POST /api/orders/:id/capture: re-checks stock, captures payment, then records the sale.
import { available, findProduct, json, paypalFetch, recordSale } from "../../../_shared/shop.js";

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
      const unit = order.data.purchase_units[0];
      const shipping = capture.data.purchase_units?.[0]?.shipping;
      const payer = capture.data.payer || {};
      const record = {
        at: new Date().toISOString(),
        name: [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(" "),
        email: payer.email_address || "",
        delivery: unit.custom_id || "ship",
        total: unit.amount?.value,
        items: items.map((i) => ({ id: i.sku, name: i.name, qty: Number(i.quantity), price: i.unit_amount?.value })),
        shipTo: shipping?.address ? { name: shipping.name?.full_name || "", address: shipping.address } : null,
        fulfilled: false,
      };
      await env.INVENTORY.put(`order:${id}`, JSON.stringify(record), {
        metadata: { at: record.at, fulfilled: false },
      });
      for (const item of record.items) await recordSale(env, item.id, item.qty);
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
