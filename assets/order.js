(function () {
  'use strict';

  const form = document.getElementById('orderLookup');
  const input = document.getElementById('orderNumber');
  const message = document.getElementById('lookupMessage');
  const result = document.getElementById('orderResult');
  let authenticated = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function statusText(status) {
    return ({
      PENDING: 'Pedido recibido',
      PAYMENT_PROCESSING: 'Pago en proceso',
      PAID: 'Pago confirmado',
      FAILED: 'Pago no completado',
      CANCELLED: 'Pedido cancelado',
      REFUNDED: 'Pedido reembolsado',
    })[status] || 'Estado por confirmar';
  }

  function accessFor(orderNumber) {
    const last = Cart.getLastOrder();
    return last && last.order_number === orderNumber ? last.access_token : '';
  }

  async function jsonResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('El servicio de pedidos no está disponible.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No pudimos consultar el pedido.');
    return data;
  }

  function detailRow(label, value, className = '') {
    const row = node('div', className);
    row.append(node('span', '', label), node('span', 'mono', value));
    return row;
  }

  function shippingText(order) {
    if (order.shipping_method === 'provincia_shalom') return `Shalom a ${order.shipping_city || 'provincia'}`;
    return 'Entrega local en Arequipa';
  }

  function renderOrder(order, token) {
    const card = node('article', 'order-card');
    const eyebrow = node('p', 'eyebrow', statusText(order.status));
    const title = node('h2', '', order.order_number);
    const meta = node('div', 'order-meta');
    meta.append(node('span', 'mono', order.created_at), node('span', 'mono', shippingText(order)));
    card.append(eyebrow, title, meta);

    const lines = node('div', 'order-lines');
    order.items.forEach((item) => {
      const row = node('div', 'summary-line');
      const info = node('p', '', item.name);
      const details = [];
      if (item.variant_color) details.push(`Color: ${item.variant_color}`);
      if (item.variant_model) details.push(`Modelo: ${item.variant_model}`);
      details.push(`${item.quantity} u. × ${Cart.formatCents(item.unit_price_cents)}`);
      info.appendChild(node('small', '', details.join(' · ')));
      row.append(info, node('strong', 'mono', Cart.formatCents(item.subtotal_cents)));
      lines.appendChild(row);
    });
    card.appendChild(lines);

    const totals = node('div', 'totals');
    totals.appendChild(detailRow('Subtotal', Cart.formatCents(order.subtotal_cents)));
    if (order.discount_cents > 0) totals.appendChild(detailRow(`Descuento${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `−${Cart.formatCents(order.discount_cents)}`));
    totals.appendChild(detailRow('Entrega', Cart.formatCents(order.shipping_cents)));
    totals.appendChild(detailRow('Total', Cart.formatCents(order.total_cents), 'grand-total'));
    card.appendChild(totals);

    const note = order.status === 'PENDING'
      ? 'Recibimos el pedido. La coordinación y la disponibilidad aún deben confirmarse; no se realizó ningún cobro en línea.'
      : `Estado actual: ${statusText(order.status)}.`;
    card.appendChild(node('p', 'form-message', note));
    if (order.receipt_available) {
      const button = node('button', 'button button-secondary', 'Descargar comprobante');
      button.type = 'button';
      button.addEventListener('click', () => downloadReceipt(order.order_number, token, button));
      card.appendChild(button);
    }
    result.replaceChildren(card);
    result.hidden = false;
  }

  async function loadOrder(orderNumber) {
    const normalized = String(orderNumber || '').trim().toUpperCase();
    if (!/^ORD-[0-9]{6,12}$/.test(normalized)) {
      message.textContent = 'Revisa el formato del número de pedido.';
      message.className = 'form-message form-error';
      return;
    }
    const token = accessFor(normalized);
    message.textContent = 'Consultando…';
    message.className = 'form-message';
    result.hidden = true;
    const headers = token ? { 'X-Order-Token': token } : {};
    try {
      const url = new URL('api/orders/get.php', document.baseURI);
      url.searchParams.set('order_number', normalized);
      const order = await jsonResponse(await fetch(url, { credentials: 'same-origin', headers }));
      message.textContent = '';
      input.value = normalized;
      const pageUrl = new URL(window.location.href);
      pageUrl.searchParams.set('order', normalized);
      history.replaceState({}, '', `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`);
      renderOrder(order, token);
    } catch (error) {
      message.textContent = authenticated
        ? error.message
        : `${error.message} Inicia sesión o usa el navegador donde confirmaste el pedido.`;
      message.className = 'form-message form-error';
    }
  }

  async function downloadReceipt(orderNumber, token, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Preparando…';
    try {
      const url = new URL('api/receipt.php', document.baseURI);
      url.searchParams.set('order_number', orderNumber);
      const response = await fetch(url, { credentials: 'same-origin', headers: token ? { 'X-Order-Token': token } : {} });
      if (!response.ok) {
        const type = response.headers.get('content-type') || '';
        const data = type.includes('application/json') ? await response.json() : null;
        throw new Error(data?.error || 'No pudimos generar el comprobante.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `comprobante-${orderNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      message.textContent = error.message;
      message.className = 'form-message form-error';
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function init() {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      loadOrder(input.value);
    });
    try {
      const response = await fetch(new URL('api/session.php', document.baseURI), { credentials: 'same-origin' });
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        const session = await response.json();
        authenticated = Boolean(session.authenticated);
      }
    } catch (_error) { /* la consulta mostrará el error concreto */ }

    const params = new URLSearchParams(window.location.search);
    const requested = params.get('order');
    const last = Cart.getLastOrder();
    const initial = requested || last?.order_number;
    if (initial) loadOrder(initial);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
