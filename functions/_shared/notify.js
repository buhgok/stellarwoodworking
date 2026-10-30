// Phone alerts for the owners through ntfy (https://ntfy.sh): a push
// notification for each new website order, and louder ones for orders that
// need attention. Alerts never include names or addresses; the details stay
// in WOOD.
//
// Environment (Pages > Settings > Variables and Secrets):
//   NTFY_TOPIC      Private topic both phones subscribe to (store as a secret).
//                   Leave unset to send no alerts (e.g. on previews).
//   NTFY_SERVER     Optional: another ntfy server, default https://ntfy.sh
//   NTFY_TOKEN      Optional: access token, for a protected topic
//   NTFY_CLICK_URL  Optional: opened when the alert is tapped (e.g. WOOD)

const money = (value, currency) => (currency === "USD" ? `$${value}` : `${value} ${currency}`);

// Builds the alert for a captured payment from what WOOD returned when
// recording it. Returns null when there's nothing to say (a retry of an
// order that was already recorded and announced).
export function orderAlert({ record, amount, currency, delivery, items, captureId }) {
  const total = money(amount, currency);
  if (!record) {
    return {
      title: "Paid order NOT recorded in WOOD",
      message: `${total} was captured (PayPal ${captureId}) but WOOD couldn't be reached. It's saved for an Admin to replay.`,
      priority: 5,
      tags: ["rotating_light"],
    };
  }
  if (record.already_recorded) return null;
  const number = record.order_number || record.details?.order_number || "";
  if (!record.ok && !number) {
    // Paid, but WOOD refused to record it (e.g. the checkout session had ended).
    return {
      title: "Paid order NOT recorded in WOOD",
      message: `${total} was captured (PayPal ${captureId}) but WOOD said: ${record.message || record.code || "unknown error"}`,
      priority: 5,
      tags: ["rotating_light"],
    };
  }
  if (!record.ok) {
    // Recorded, but flagged for an Admin (e.g. the amount didn't match).
    return {
      title: `Order ${number} needs review`,
      message: `${total} paid. WOOD says: ${record.message || "see Exceptions in WOOD"}`,
      priority: 4,
      tags: ["warning"],
    };
  }
  return {
    title: `New order ${number}`.trim(),
    message: `${total} · ${delivery === "ship" ? "Ship" : "Pickup"} · ${items} item${items === 1 ? "" : "s"}`,
    priority: 4,
    tags: ["moneybag"],
  };
}

// Sends an alert. Never throws: an alert that can't be sent is logged, and
// the order itself is unaffected.
export async function notify(env, alert) {
  if (!alert || !env.NTFY_TOPIC) return;
  try {
    const res = await fetch((env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "") + "/", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}) },
      body: JSON.stringify({ topic: env.NTFY_TOPIC, ...alert, ...(env.NTFY_CLICK_URL ? { click: env.NTFY_CLICK_URL } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("ntfy alert failed", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("ntfy alert failed", err);
  }
}
