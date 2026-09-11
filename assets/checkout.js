(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    form: $('checkoutForm'), lines: $('checkoutLines'), subtotal: $('checkoutSubtotal'), shipping: $('checkoutShipping'),
    total: $('checkoutTotal'), discount: $('checkoutDiscount'), discountRow: $('discountRow'), message: $('checkoutMessage'),
    coupon: $('couponCode'), couponButton: $('validateCoupon'), couponMessage: $('couponMessage'), submit: $('submitOrder'),
    method: $('shippingMethod'), city: $('shippingCity'), cityField: $('cityField'), address: $('shippingAddress'),
    name: $('customerName'), email: $('customerEmail'), phone: $('customerPhone'), reference: $('shippingReference'),
    accountHint: $('accountHint'),
  };
  let csrfToken = '';
  let shippingConfig = { arequipa_local_cents: 0, provincia_shalom_cents: 0 };
  let cartResult = null;
  let quote = null;
  let apiReady = false;
  let submitting = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  async function responseJson(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('El servidor de pedidos no está disponible.');
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'No se pudo completar la solicitud.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadSession() {
    const response = await fetch(new URL('api/session.php', document.baseURI), { credentials: 'same-origin' });
    const data = await responseJson(response);
    csrfToken = data.csrf_token || '';
    shippingConfig = data.shipping || shippingConfig;
    apiReady = Boolean(csrfToken);
    if (data.authenticated && data.user) {
      ui.name.value = data.user.name || '';
      ui.email.value = data.user.email || '';
      ui.phone.value = data.user.phone || '';
      if (data.user.shipping_method) ui.method.value = data.user.shipping_method;
      ui.city.value = data.user.shipping_city || '';
      ui.address.value = data.user.shipping_address || '';
      ui.reference.value = data.user.shipping_reference || '';
      ui.accountHint.textContent = 'Tu cuenta está activa; este pedido quedará asociado a tu historial.';
    }
    syncShippingFields();
  }

  function shippingCents() {
    return ui.method.value === 'provincia_shalom'
      ? Number(shippingConfig.provincia_shalom_cents || 0)
      : Number(shippingConfig.arequipa_local_cents || 0);
  }

  function renderTotals() {
    const subtotal = quote ? Number(quote.subtotal_cents) : Number(cartResult?.subtotalCents || 0);
    const delivery = quote ? Number(quote.shipping_cents) : shippingCents();
    const discount = quote ? Number(quote.discount_cents) : 0;
    ui.subtotal.textContent = Cart.formatCents(subtotal);
    ui.shipping.textContent = Cart.formatCents(delivery);
    ui.discount.textContent = `−${Cart.formatCents(discount)}`;
    ui.discountRow.hidden = discount <= 0;
    ui.total.textContent = Cart.formatCents(Math.max(0, subtotal - discount + delivery));
  }

  function renderCart() {
    ui.lines.replaceChildren();
    if (!cartResult || !cartResult.lines.length) {
      ui.lines.appendChild(node('p', 'form-error', 'Tu carrito está vacío.'));
      return;
    }
    cartResult.lines.forEach((line) => {
      const row = node('div', 'summary-line');
      const info = node('p', '', line.name);
      const details = [];
      if (line.variant_color) details.push(`Color: ${line.variant_color}`);
      if (line.variant_model) details.push(`Modelo: ${line.variant_model}`);
      details.push(`${line.quantity} u.`);
      if (line.wholesale_applied) details.push('mayorista');
      info.appendChild(node('small', '', details.join(' · ')));
      if (line.blocked || line.needs_options) info.appendChild(node('small', 'form-error', line.blocked ? 'No disponible' : 'Falta elegir variante'));
      row.append(info, node('strong', 'mono', Cart.formatCents(line.subtotal_cents)));
      ui.lines.appendChild(row);
    });
  }

  async function refreshCart() {
    quote = null;
    ui.couponMessage.textContent = '';
    try {
      cartResult = await Cart.enriched();
      renderCart();
      renderTotals();
      ui.submit.disabled = !(apiReady && cartResult.canCheckout);
    } catch (_error) {
      cartResult = null;
      ui.lines.replaceChildren(node('p', 'form-error', 'No pudimos cargar el carrito.'));
      ui.submit.disabled = true;
    }
  }

  function syncShippingFields() {
    const province = ui.method.value === 'provincia_shalom';
    ui.cityField.hidden = !province;
    ui.city.required = province;
    ui.address.required = !province;
    quote = null;
    ui.couponMessage.textContent = '';
    renderTotals();
  }

  function cartItems() {
    return Cart.getItems().map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      variant_color: item.variant_color,
      variant_model: item.variant_model,
    }));
  }

  async function validateCoupon() {
    const code = ui.coupon.value.trim();
    if (!code) {
      quote = null;
      ui.couponMessage.textContent = 'Ingresa un código para validarlo.';
      ui.couponMessage.className = 'form-message form-error';
      renderTotals();
      return;
    }
    if (!csrfToken || !cartResult?.canCheckout) return;
    ui.couponButton.disabled = true;
    ui.couponMessage.textContent = 'Validando…';
    try {
      const response = await fetch(new URL('api/coupons/validate.php', document.baseURI), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ items: cartItems(), shipping: { method: ui.method.value }, coupon_code: code }),
      });
      quote = await responseJson(response);
      ui.coupon.value = quote.code || code.toUpperCase();
      ui.couponMessage.textContent = quote.valid ? 'Cupón válido. El descuento se confirmará al enviar el pedido.' : 'Sin cupón aplicado.';
      ui.couponMessage.className = 'form-message form-success';
      renderTotals();
    } catch (error) {
      quote = null;
      ui.couponMessage.textContent = error.message;
      ui.couponMessage.className = 'form-message form-error';
      renderTotals();
    } finally {
      ui.couponButton.disabled = false;
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (submitting || !apiReady || !cartResult?.canCheckout) return;
    submitting = true;
    ui.submit.disabled = true;
    ui.submit.textContent = 'Confirmando…';
    ui.message.textContent = '';
    const accessToken = Cart.getOrderAccessToken();
    const payload = {
      items: cartItems(),
      customer: { name: ui.name.value, email: ui.email.value, phone: ui.phone.value },
      shipping: { method: ui.method.value, city: ui.city.value, address: ui.address.value, reference: ui.reference.value },
      coupon_code: ui.coupon.value.trim() || null,
      idempotency_key: Cart.getCheckoutIdempotencyKey(),
      order_access_token: accessToken,
    };
    try {
      const response = await fetch(new URL('api/orders/create.php', document.baseURI), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(payload),
      });
      const order = await responseJson(response);
      Cart.rememberLastOrder(order.order_number, order.access_token || accessToken);
      Cart.clear();
      window.location.href = `order.html?order=${encodeURIComponent(order.order_number)}`;
    } catch (error) {
      ui.message.textContent = error.status === 419
        ? 'La sesión venció. Recarga la página y vuelve a confirmar.'
        : error.message;
      ui.message.className = 'form-message form-error';
      submitting = false;
      ui.submit.disabled = !(apiReady && cartResult?.canCheckout);
      ui.submit.textContent = 'Confirmar pedido';
    }
  }

  async function init() {
    ui.method.addEventListener('change', syncShippingFields);
    ui.coupon.addEventListener('input', () => { quote = null; ui.couponMessage.textContent = ''; renderTotals(); });
    ui.couponButton.addEventListener('click', validateCoupon);
    ui.form.addEventListener('submit', submitOrder);
    Cart.subscribe(refreshCart);

    const results = await Promise.allSettled([loadSession(), refreshCart()]);
    if (results[0].status === 'rejected') {
      ui.message.textContent = 'No pudimos conectar con el servidor de pedidos. Inténtalo nuevamente cuando esté disponible.';
      ui.message.className = 'form-message form-error';
      apiReady = false;
    }
    ui.submit.disabled = !(apiReady && cartResult?.canCheckout);
    renderTotals();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
