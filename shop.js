(() => {
  const CART_KEY = 'stellar-cart';
  const grid = document.getElementById('shop-grid');
  const cartSection = document.getElementById('cart');
  const cartWrap = document.getElementById('cart-wrap');
  const cartPill = document.getElementById('cart-pill');
  const state = { catalog: null, cart: loadCart(), delivery: 'ship', paypalReady: false, lastError: '', photo: {} };

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch {}
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: state.catalog?.currency || 'USD' }).format(n);
  const product = id => state.catalog.products.find(p => p.id === id);
  const inCart = id => state.cart.find(l => l.id === id)?.qty || 0;

  async function loadCatalog() {
    try {
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      state.catalog = await res.json();
    } catch {
      grid.innerHTML = '<p class="shop-status">The shop couldn\'t load right now. Please refresh to try again.</p>';
      return;
    }
    // Drop or trim cart lines that no longer match what's available.
    state.cart = state.cart
      .filter(l => product(l.id))
      .map(l => ({ id: l.id, qty: Math.min(l.qty, product(l.id).available) }))
      .filter(l => l.qty > 0);
    saveCart();
    render();
  }

  function render() {
    renderProducts();
    renderCart();
  }

  function renderProducts() {
    const { products } = state.catalog;
    if (!products.length) {
      grid.innerHTML = '<p class="shop-status">New pieces are on the way. Check back soon.</p>';
      return;
    }
    grid.innerHTML = products.map(p => {
      const soldOut = p.available === 0;
      const full = inCart(p.id) >= p.available;
      const stock = soldOut ? 'Sold' : p.unique ? 'One of a kind' : `${p.available} in stock`;
      const button = soldOut ? 'Sold' : full ? (p.unique ? 'In Your Cart' : 'All in Your Cart') : 'Add to Cart';
      return `<article class="shop-card${soldOut ? ' is-sold' : ''}">
        ${gallery(p)}
        <div class="shop-card-content">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          ${p.details ? `<p class="shop-details">${esc(p.details)}</p>` : ''}
          ${p.note ? `<p class="shop-note">${esc(p.note)}</p>` : ''}
          <div class="shop-meta"><span class="stock">${stock}</span>${p.shippable ? '' : '<span class="stock">Local pickup only</span>'}</div>
          <span class="price">${money(p.price)}</span>
          <button class="button add-to-cart" type="button" data-id="${esc(p.id)}"${soldOut || full ? ' disabled' : ''}>${button}</button>
        </div>
      </article>`;
    }).join('');
  }

  function gallery(p) {
    const images = p.images || [];
    if (!images.length) return '<div class="shop-image">Product photo placeholder</div>';
    const index = (state.photo[p.id] || 0) % images.length;
    const slides = images.map((src, i) => `<img class="shop-image${i === index ? ' is-active' : ''}" src="${esc(src)}" alt="${esc(p.name)}, photo ${i + 1} of ${images.length}"${i ? ' loading="lazy"' : ''}>`).join('');
    if (images.length === 1) return `<div class="shop-gallery">${slides}</div>`;
    return `<div class="shop-gallery" data-gallery="${esc(p.id)}">${slides}
      <button class="gallery-arrow prev" type="button" data-step="-1" aria-label="Previous photo">&#8249;</button>
      <button class="gallery-arrow next" type="button" data-step="1" aria-label="Next photo">&#8250;</button>
      <div class="gallery-dots">${images.map((_, i) => `<span${i === index ? ' class="is-active"' : ''}></span>`).join('')}</div>
    </div>`;
  }

  // Changes photos in place so the rest of the card doesn't re-render.
  function showPhoto(el, step) {
    const id = el.dataset.gallery;
    const slides = el.querySelectorAll('.shop-image');
    const index = ((state.photo[id] || 0) + step + slides.length) % slides.length;
    state.photo[id] = index;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    el.querySelectorAll('.gallery-dots span').forEach((d, i) => d.classList.toggle('is-active', i === index));
  }

  function totals() {
    const { shipping = {}, pickup = {} } = state.catalog;
    const allShippable = state.cart.every(l => product(l.id).shippable);
    if (!allShippable && pickup.enabled) state.delivery = 'pickup';
    if (!pickup.enabled) state.delivery = 'ship';
    const subtotal = state.cart.reduce((sum, l) => sum + product(l.id).price * l.qty, 0);
    const free = shipping.freeOver != null && subtotal >= shipping.freeOver;
    const rate = shippingCost();
    const ship = state.delivery === 'ship' && !free ? rate : 0;
    return { subtotal, rate, ship, free, total: subtotal + ship, allShippable };
  }

  // Mirrors the server: costliest item at full rate, each other unit at its "additional" rate.
  function shippingCost() {
    const cents = v => Math.round(Number(v || 0) * 100);
    const lines = state.cart.map(l => ({ qty: l.qty, ...product(l.id).shipping }));
    if (!lines.length) return 0;
    const top = lines.reduce((a, b) => cents(b.first) > cents(a.first) ? b : a);
    const extras = lines.reduce((sum, l) => sum + cents(l.additional) * l.qty, 0);
    return (cents(top.first) + extras - cents(top.additional)) / 100;
  }

  function renderCart() {
    const count = state.cart.reduce((sum, l) => sum + l.qty, 0);
    cartPill.hidden = count === 0;
    cartPill.querySelector('span').textContent = count;
    cartSection.hidden = count === 0;
    if (!count) return;

    const { shipping = {}, pickup = {} } = state.catalog;
    const t = totals();
    const shipLabel = t.free
      ? `Free shipping on orders over ${money(shipping.freeOver)}`
      : shipping.freeOver != null
        ? `${money(t.rate)}, free on orders over ${money(shipping.freeOver)}`
        : money(t.rate);

    cartWrap.innerHTML = `
      <h2>Your Cart</h2>
      <ul class="cart-lines">${state.cart.map(l => {
        const p = product(l.id);
        return `<li class="cart-line">
          <div><strong>${esc(p.name)}</strong><span>${money(p.price)}${p.unique ? ' · One of a kind' : ''}</span></div>
          <div class="cart-qty">
            ${p.unique ? '' : `<button type="button" data-qty="-1" data-id="${esc(p.id)}" aria-label="Decrease quantity">−</button><span>${l.qty}</span><button type="button" data-qty="1" data-id="${esc(p.id)}" aria-label="Increase quantity"${l.qty >= p.available ? ' disabled' : ''}>+</button>`}
            <button type="button" class="cart-remove" data-remove="${esc(p.id)}">Remove</button>
          </div>
        </li>`;
      }).join('')}</ul>
      <fieldset class="delivery">
        <legend>Delivery</legend>
        <label><input type="radio" name="delivery" value="ship"${state.delivery === 'ship' ? ' checked' : ''}${t.allShippable ? '' : ' disabled'}> Ship to me <small>${t.allShippable ? shipLabel : 'Not available for pickup-only items'}</small></label>
        ${pickup.enabled ? `<label><input type="radio" name="delivery" value="pickup"${state.delivery === 'pickup' ? ' checked' : ''}> Local pickup <small>${esc(pickup.note)}</small></label>` : ''}
      </fieldset>
      <dl class="cart-totals">
        <div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div>
        <div><dt>Shipping</dt><dd>${state.delivery === 'pickup' ? 'Pickup' : t.free ? 'Free' : money(t.ship)}</dd></div>
        <div class="cart-total"><dt>Total</dt><dd>${money(t.total)}</dd></div>
      </dl>
      <p class="cart-message" role="status" id="cart-message"></p>
      <div id="paypal-buttons"></div>
      ${state.catalog.paypalClientId ? '<p class="form-note">Pay securely with PayPal or a debit/credit card. No PayPal account needed.</p>' : '<p class="form-note">Online checkout is being set up. Please check back soon.</p>'}`;
    mountPayPal();
  }

  function message(text) {
    const el = document.getElementById('cart-message');
    if (el) el.textContent = text;
  }

  function loadPayPalSdk() {
    if (window.paypal) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(state.catalog.paypalClientId)}&currency=${state.catalog.currency}&intent=capture&components=buttons&disable-funding=paylater`;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function mountPayPal() {
    if (!state.catalog.paypalClientId) return;
    try { await loadPayPalSdk(); } catch { message('PayPal couldn\'t load. Please refresh to try again.'); return; }
    const container = document.getElementById('paypal-buttons');
    if (!container) return;
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
      createOrder: async () => {
        message('');
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: state.cart, delivery: state.delivery }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { state.lastError = data.error; throw new Error(data.error); }
        return data.id;
      },
      onApprove: async (data, actions) => {
        const res = await fetch(`/api/orders/${encodeURIComponent(data.orderID)}/capture`, { method: 'POST' });
        const result = await res.json().catch(() => ({}));
        if (result.declined) { message('Your payment was declined. Please try another payment method.'); return actions.restart(); }
        if (!res.ok) { state.lastError = result.error; throw new Error(result.error); }
        complete(result);
      },
      onCancel: data => {
        // Free the pieces held for this checkout right away.
        fetch(`/api/orders/${encodeURIComponent(data.orderID)}/cancel`, { method: 'POST' }).catch(() => {});
      },
      onError: () => {
        message(state.lastError || 'Something went wrong with checkout. You have not been charged.');
        state.lastError = '';
        loadCatalog();
      },
    }).render(container);
  }

  function complete(result) {
    const pickup = state.delivery === 'pickup';
    state.cart = [];
    saveCart();
    cartPill.hidden = true;
    loadCatalog().then(() => {
      cartSection.hidden = false;
      cartWrap.innerHTML = `<div class="order-complete">
        <div class="eyebrow">Order Confirmed</div>
        <h2>Thank you${result.name ? `, ${esc(result.name)}` : ''}!</h2>
        <p>Your order is in. A receipt from PayPal is on its way${result.email ? ` to ${esc(result.email)}` : ''}. ${pickup ? 'We\'ll email you soon to arrange pickup.' : 'We\'ll let you know when your order ships.'}</p>
        <p class="form-note">Order number: ${esc(result.orderNumber || result.id)}</p>
      </div>`;
      cartSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function setQty(id, qty) {
    const p = product(id);
    qty = Math.max(0, Math.min(qty, p.available));
    state.cart = qty
      ? (inCart(id) ? state.cart.map(l => l.id === id ? { ...l, qty } : l) : [...state.cart, { id, qty }])
      : state.cart.filter(l => l.id !== id);
    saveCart();
    render();
  }

  let touchX = null;
  grid.addEventListener('touchstart', e => {
    touchX = e.target.closest('[data-gallery]') ? e.touches[0].clientX : null;
  }, { passive: true });
  grid.addEventListener('touchend', e => {
    const el = e.target.closest('[data-gallery]');
    if (!el || touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showPhoto(el, dx < 0 ? 1 : -1);
    touchX = null;
  });

  grid.addEventListener('click', e => {
    const arrow = e.target.closest('.gallery-arrow');
    if (arrow) return showPhoto(arrow.closest('[data-gallery]'), Number(arrow.dataset.step));
    const btn = e.target.closest('.add-to-cart');
    if (!btn) return;
    setQty(btn.dataset.id, inCart(btn.dataset.id) + 1);
  });

  cartWrap.addEventListener('click', e => {
    const qty = e.target.closest('[data-qty]');
    const remove = e.target.closest('[data-remove]');
    if (qty) setQty(qty.dataset.id, inCart(qty.dataset.id) + Number(qty.dataset.qty));
    if (remove) setQty(remove.dataset.remove, 0);
  });

  cartWrap.addEventListener('change', e => {
    if (e.target.name !== 'delivery') return;
    state.delivery = e.target.value;
    renderCart();
  });

  loadCatalog();
})();
