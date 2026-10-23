// Password-protects /admin and /api/admin/* with HTTP Basic auth.
// Set ADMIN_PASSWORD (as a secret) in Pages > Settings > Variables and Secrets.
// Username is "admin".

const PROTECTED = /^\/(admin(\/|\.html)?|api\/admin\/)/;

async function digest(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

async function authorized(request, password) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try { decoded = atob(header.slice(6)); } catch { return false; }
  const [a, b] = await Promise.all([digest(decoded), digest(`admin:${password}`)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);
  if (!PROTECTED.test(pathname)) return next();

  if (!env.ADMIN_PASSWORD) {
    return new Response("Admin is not set up yet. Add ADMIN_PASSWORD in Cloudflare.", { status: 503 });
  }
  if (!(await authorized(request, env.ADMIN_PASSWORD))) {
    return new Response("Login required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Stellar Woodworking Admin", charset="UTF-8"' },
    });
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}
