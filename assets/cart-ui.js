(function () {
  'use strict';

  if (!window.Cart) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let returnFocus = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', name === 'close'
      ? 'M5 5l14 14M19 5L5 19'
      : 'M3 3h2l2.5 12h10.8l2.2-8H6.2M9 21h.01M18 21h.01');
    svg.appendChild(path);
    return svg;
  }

  function build() {
    const trigger = element('button', 'cart-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Abrir carrito');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'cartDrawer');
    trigger.appendChild(icon('cart'));
    const badge = element('span', 'cart-badge', '0');
    badge.hidden = true;
    trigger.appendChild(badge);

    const mount = document.querySelector('.nav-actions') || document.querySelector('nav');
    if (!mount) return null;
    mount.prepend(trigger);

    const overlay = element('div', 'cart-overlay');
    overlay.hidden = true;
    const drawer = element('aside', 'cart-drawer');
    drawer.id = 'cartDrawer';
    drawer.hidden = true;
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'cartTitle');
    drawer.tabIndex = -1;

    const header = element('div', 'cart-drawer-head');
    const title = element('h2', '', 'Tu carrito');
    title.id = 'cartTitle';
    const close = element('button', 'icon-button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar carrito');
    close.appendChild(icon('close'));
    header.append(title, close);

    const items = element('div', 'cart-items');
    items.setAttribute('aria-live', 'polite');
    const footer = element('div', 'cart-drawer-foot');
    const subtotalRow = element('div', 'cart-total-row');
    subtotalRow.append(element('span', '', 'Subtotal estimado'));
    const subtotal = element('strong', '', Cart.formatCents(0));
    subtotalRow.appendChild(subtotal);
    const note = element('p', 'fine-print', 'El servidor confirma precios, descuento y entrega al enviar el pedido.');
    const checkout = element('a', 'button button-primary cart-checkout', 'Confirmar pedido');
    checkout.href = 'checkout.html';
    footer.append(subtotalRow, note, checkout);
    drawer.append(header, items, footer);
    document.body.append(overlay, drawer);
    return { trigger, badge, overlay, drawer, close, items, subtotal, checkout };
  }

  function variantText(line) {
    const parts = [];
    if (line.variant_color) parts.push(`Color: ${line.variant_color}`);
    if (line.variant_model) parts.push(`Modelo: ${line.variant_model}`);
    return parts.join(' · ');
  }

  function makeLine(line) {
    const row = element('article', 'cart-line');
    row.vulkanLineKey = line.line_key;
    const media = element('div', 'cart-line-media');
    if (line.image) {
      const image = document.createElement('img');
      image.src = line.image;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      media.appendChild(image);
    }

    const body = element('div', 'cart-line-body');
    body.appendChild(element('h3', '', line.name));
    const variants = variantText(line);
    if (variants) body.appendChild(element('p', 'cart-variant', variants));
    if (line.wholesale_applied) body.appendChild(element('p', 'cart-price-note', 'Precio mayorista aplicado'));
    if (line.blocked) body.appendChild(element('p', 'form-error', 'No disponible para pedidos.'));
    if (line.needs_options) {
      const warning = element('p', 'form-error', 'Falta elegir una variante. Quita esta línea y vuelve al catálogo.');
      body.appendChild(warning);
    }

    const controls = element('div', 'cart-line-controls');
    const quantity = element('div', 'quantity-control');
    const decrement = element('button', '', '−');
    decrement.type = 'button';
    decrement.dataset.action = 'decrement';
    decrement.setAttribute('aria-label', `Restar una unidad de ${line.name}`);
    const amount = element('span', '', String(line.quantity));
    amount.setAttribute('aria-label', `${line.quantity} unidades`);
    const increment = element('button', '', '+');
    increment.type = 'button';
    increment.dataset.action = 'increment';
    increment.setAttribute('aria-label', `Sumar una unidad de ${line.name}`);
    quantity.append(decrement, amount, increment);
    const price = element('strong', 'mono', Cart.formatCents(line.subtotal_cents));
    controls.append(quantity, price);
    const remove = element('button', 'text-button', 'Quitar');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    body.append(controls, remove);
    row.append(media, body);
    return row;
  }

  async function render(ui) {
    ui.items.replaceChildren(element('p', 'cart-empty', 'Cargando carrito…'));
    try {
      const result = await Cart.enriched();
      ui.items.replaceChildren();
      if (!result.lines.length) ui.items.appendChild(element('p', 'cart-empty', 'Tu carrito está vacío.'));
      else result.lines.forEach((line) => ui.items.appendChild(makeLine(line)));
      ui.subtotal.textContent = Cart.formatCents(result.subtotalCents);
      if (result.canCheckout) {
        ui.checkout.href = 'checkout.html';
        ui.checkout.removeAttribute('aria-disabled');
      } else {
        ui.checkout.removeAttribute('href');
        ui.checkout.setAttribute('aria-disabled', 'true');
      }
    } catch (_error) {
      ui.items.replaceChildren(element('p', 'form-error', 'No pudimos cargar el carrito. Inténtalo nuevamente.'));
      ui.checkout.removeAttribute('href');
      ui.checkout.setAttribute('aria-disabled', 'true');
    }
  }

  function focusable(container) {
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.hidden);
  }

  function init() {
    const ui = build();
    if (!ui) return;
    let oldOverflow = '';

    const updateBadge = () => {
      const count = Cart.count();
      ui.badge.textContent = count > 99 ? '99+' : String(count);
      ui.badge.hidden = count === 0;
    };
    const open = () => {
      returnFocus = document.activeElement;
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      ui.overlay.hidden = false;
      ui.drawer.hidden = false;
      requestAnimationFrame(() => {
        ui.overlay.classList.add('is-open');
        ui.drawer.classList.add('is-open');
      });
      ui.trigger.setAttribute('aria-expanded', 'true');
      render(ui).finally(() => ui.close.focus());
    };
    const close = () => {
      ui.overlay.classList.remove('is-open');
      ui.drawer.classList.remove('is-open');
      ui.trigger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = oldOverflow;
      window.setTimeout(() => {
        ui.overlay.hidden = true;
        ui.drawer.hidden = true;
      }, reduceMotion ? 0 : 220);
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    };

    ui.trigger.addEventListener('click', open);
    ui.close.addEventListener('click', close);
    ui.overlay.addEventListener('click', close);
    ui.drawer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable(ui.drawer);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    ui.items.addEventListener('click', (event) => {
      const action = event.target.closest('button[data-action]');
      const row = action && action.closest('.cart-line');
      if (!action || !row) return;
      const item = Cart.getItems().find((candidate) => Cart.lineKey(candidate) === row.vulkanLineKey);
      if (!item) return;
      if (action.dataset.action === 'remove') Cart.removeItem(row.vulkanLineKey);
      if (action.dataset.action === 'increment') Cart.setQuantity(row.vulkanLineKey, item.quantity + 1);
      if (action.dataset.action === 'decrement') Cart.setQuantity(row.vulkanLineKey, item.quantity - 1);
    });

    Cart.subscribe(() => {
      updateBadge();
      if (!ui.drawer.hidden) render(ui);
    });
    updateBadge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
