// GET /api/products: the catalog with live availability, plus checkout settings.
// Each WOOD listing (a product at one price) is one shop product; its id is
// the WOOD listing_id.
import { failureReason, json, photoUrl, wood } from "../_shared/shop.js";

export async function onRequestGet({ env }) {
  try {
    const catalog = await wood(env, "website_catalog");
    if (!catalog.ok) throw new Error(catalog.message);

    const products = catalog.listings.map((l) => ({
      id: l.listing_id,
      name: l.name,
      description: l.description || "",
      details: l.details || "",
      note: l.note || "",
      price: Number(l.price),
      images: (l.images || []).map((path) => photoUrl(env, path)),
      shippable: l.shippable,
      shipping: { first: Number(l.shipping.first), additional: Number(l.shipping.additional) },
      unique: l.unique,
      available: l.available,
    }));

    return json({
      currency: catalog.currency,
      shipping: { freeOver: catalog.shipping.free_over == null ? null : Number(catalog.shipping.free_over) },
      pickup: catalog.pickup,
      paypalClientId: env.PAYPAL_CLIENT_ID || null,
      // The sandbox only offers Venmo when told the buyer is in the US.
      paypalSandbox: env.PAYPAL_ENV !== "live",
      products,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "The shop couldn't load right now.", reason: failureReason(err) }, 503);
  }
}
