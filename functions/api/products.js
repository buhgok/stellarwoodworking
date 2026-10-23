// GET /api/products: the catalog with live availability, plus checkout settings.
import { catalog, available, json, priceFor, shippingFor } from "../_shared/shop.js";

export async function onRequestGet({ env }) {
  const products = await Promise.all(
    catalog.products
      .filter((p) => p.active !== false)
      .map(async (p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        details: p.details || "",
        price: await priceFor(env, p),
        images: p.images || (p.image ? [p.image] : []),
        shippable: p.shippable !== false,
        shipping: await shippingFor(env, p),
        unique: Number(p.quantity) === 1,
        available: await available(env, p),
      }))
  );

  return json({
    currency: catalog.currency,
    shipping: catalog.shipping,
    pickup: catalog.pickup,
    paypalClientId: env.PAYPAL_CLIENT_ID || null,
    products,
  });
}
