// POST /api/orders/:id/capture: confirms the WOOD hold, captures payment with
// PayPal, then records the paid order in WOOD.
import { SHIPPING_AREA_MESSAGE, holdIdFrom, isPayPalOrderId, json, paypalFetch, shipsTo, wood } from "../../../_shared/shop.js";
import { notify, orderAlert } from "../../../_shared/notify.js";

export async function onRequestPost({ params, env, waitUntil }) {
  const id = String(params.id || "");
  if (!isPayPalOrderId(id)) return json({ error: "Invalid order." }, 400);

  try {
    const order = await paypalFetch(env, `/v2/checkout/orders/${id}`);
    if (!order.ok) return json({ error: "Order not found." }, 404);
    const holdId = holdIdFrom(order.data);
    if (!holdId) return json({ error: "Order not found." }, 404);

    // A retry after the capture already went through only needs recording.
    let captured = order.data.status === "COMPLETED" ? order.data : null;

    if (!captured) {
      // Only charge for addresses we ship to; free the pieces otherwise so the
      // shopper can start again with another address or pickup.
      const shipTo = order.data.purchase_units?.[0]?.shipping?.address;
      if (shipTo && !shipsTo(shipTo)) {
        await wood(env, "website_release_hold", { p_hold_id: holdId }).catch((err) => console.error(err));
        return json({ error: SHIPPING_AREA_MESSAGE, shippingArea: true }, 422);
      }

      // Make sure the pieces are still ours before taking payment.
      const confirm = await wood(env, "website_confirm_hold", { p_hold_id: holdId });
      if (!confirm.ok) return json({ error: confirm.message }, 409);

      const capture = await paypalFetch(env, `/v2/checkout/orders/${id}/capture`, { method: "POST", body: "{}" });
      if (!capture.ok) {
        console.error("PayPal capture failed", capture.status, JSON.stringify(capture.data));
        const declined = capture.data?.details?.some((d) => d.issue === "INSTRUMENT_DECLINED");
        return json({ error: declined ? "Your payment was declined." : "Payment couldn't be completed.", declined }, 422);
      }
      captured = capture.data;
    }

    const unit = captured.purchase_units?.[0] || {};
    const payment = unit.payments?.captures?.[0];
    if (!payment?.id) throw new Error(`PayPal order ${id} has no capture.`);
    const payer = captured.payer || {};
    const address = unit.shipping?.address;

    const record = await recordPaidOrder(env, {
      p_hold_id: holdId,
      p_paypal_order_id: id,
      p_paypal_capture_id: payment.id,
      p_amount: payment.amount?.value,
      p_currency: payment.amount?.currency_code,
      p_payer: {
        email: payer.email_address || "",
        first_name: payer.name?.given_name || "",
        last_name: payer.name?.surname || "",
      },
      p_ship_to: address
        ? {
            name: unit.shipping?.name?.full_name || "",
            street_1: address.address_line_1 || "",
            street_2: address.address_line_2 || "",
            city: address.admin_area_2 || "",
            state: address.admin_area_1 || "",
            postal_code: address.postal_code || "",
            country: address.country_code || "",
          }
        : null,
    });

    // Tell the owners' phones, without holding up the shopper's confirmation.
    const items = (order.data.purchase_units?.[0]?.items || []).reduce((n, item) => n + (Number(item.quantity) || 0), 0);
    waitUntil(notify(env, orderAlert({
      record,
      amount: payment.amount?.value,
      currency: payment.amount?.currency_code,
      delivery: address ? "ship" : "pickup",
      items,
      captureId: payment.id,
    })));

    return json({
      id,
      orderNumber: record?.order_number || record?.details?.order_number || null,
      status: captured.status,
      name: payer.name?.given_name || "",
      email: payer.email_address || "",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Checkout isn't available right now." }, 503);
  }
}

// Payment has been taken, so recording must not be lost: retry, then park the
// order in KV for an Admin to replay into WOOD.
async function recordPaidOrder(env, args) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await wood(env, "website_record_paid_order", args);
      if (!result.ok) console.error("WOOD flagged website order", JSON.stringify(result));
      return result;
    } catch (err) {
      console.error(`Recording paid order failed (attempt ${attempt})`, err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  console.error("UNRECORDED PAID ORDER", JSON.stringify(args));
  if (env.INVENTORY) {
    await env.INVENTORY.put(`unrecorded:${args.p_paypal_capture_id}`, JSON.stringify({ at: new Date().toISOString(), args }));
  }
  return null;
}
