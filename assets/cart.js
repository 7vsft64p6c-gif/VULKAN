(function (window) {
  'use strict';

  const STORAGE_KEY = 'vulkan_cart_v2';
  const LEGACY_KEY = 'vulkan_cart_v1';
  const IDEMPOTENCY_KEY = 'vulkan_order_attempt_v2';
  const ACCESS_KEY = 'vulkan_order_access_v2';
  const LAST_ORDER_KEY = 'vulkan_last_order_v2';
  const OPTION_LIMIT = 160;
  let listeners = [];
  let productsCache = null;
  let productsPromise = null;

  function cleanOption(value) {
    if (typeof value !== 'string') return null;
    const result = value.trim().slice(0, OPTION_LIMIT);
    return result || null;
  }

  function cleanQuantity(value) {
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity > 0 ? Math.min(999, quantity) : null;
  }

  function normalizeItem(value) {
    if (!value || typeof value !== 'object' || typeof value.product_id !== 'string') return null;
    const productId = value.product_id.trim().slice(0, 160);
    const quantity = cleanQuantity(value.quantity);
    if (!productId || quantity === null) return null;
    return {
      product_id: productId,
      quantity,
      variant_color: cleanOption(value.variant_color),
      variant_model: cleanOption(value.variant_model),
    };
  }

  function lineKey(item) {
    return [item.product_id, item.variant_color || '', item.variant_model || ''].join('\u001f');
  }

  function combine(items) {
    const byKey = new Map();
    items.map(normalizeItem).filter(Boolean).forEach((item) => {
      const key = lineKey(item);
      if (byKey.has(key)) byKey.get(key).quantity = Math.min(999, byKey.get(key).quantity + item.quantity);
      else byKey.set(key, item);
    });
    return Array.from(byKey.values()).slice(0, 100);
  }

  function readRaw() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return combine(JSON.parse(current));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return [];
      const migrated = combine(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    } catch (_error) {
      return [];
    }
  }

  function writeRaw(items) {
    const normalized = combine(items);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    sessionStorage.removeItem(IDEMPOTENCY_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    listeners.forEach((listener) => {
      try { listener(normalized); } catch (_error) { /* un listener no debe romper el carrito */ }
    });
  }

  function loadProducts() {
    if (productsCache) return Promise.resolve(productsCache);
    if (productsPromise) return productsPromise;
    const url = new URL('products.json', document.baseURI);
    productsPromise = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
        return response.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data.products)) throw new Error('El catálogo no tiene el formato esperado.');
        productsCache = data;
        return data;
      })
      .catch((error) => {
        productsPromise = null;
        throw error;
      });
    return productsPromise;
  }

  function randomToken() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
      throw new Error('Este navegador no puede crear un identificador seguro.');
    }
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function allowedValues(product, field) {
    const source = Array.isArray(product[field]) ? product[field] : [];
    if (field === 'colores') {
      return source.map((entry) => entry && typeof entry.nombre === 'string' ? entry.nombre.trim() : '').filter(Boolean);
    }
    return source.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean);
  }

  const Cart = {
    getItems() {
      return readRaw().map((item) => ({ ...item }));
    },

    lineKey,

    count() {
      return readRaw().reduce((sum, item) => sum + item.quantity, 0);
    },

    addItem(productId, quantity = 1, variants = {}) {
      const item = normalizeItem({
        product_id: productId,
        quantity,
        variant_color: variants.variant_color,
        variant_model: variants.variant_model,
      });
      if (!item) return false;
      const items = readRaw();
      const key = lineKey(item);
      const existing = items.find((candidate) => lineKey(candidate) === key);
      if (existing) existing.quantity = Math.min(999, existing.quantity + item.quantity);
      else items.push(item);
      writeRaw(items);
      return true;
    },

    setQuantity(key, quantity) {
      const next = cleanQuantity(quantity);
      let items = readRaw();
      if (next === null) items = items.filter((item) => lineKey(item) !== key);
      else {
        const item = items.find((candidate) => lineKey(candidate) === key);
        if (item) item.quantity = next;
      }
      writeRaw(items);
    },

    removeItem(key) {
      writeRaw(readRaw().filter((item) => lineKey(item) !== key));
    },

    clear() {
      writeRaw([]);
    },

    subscribe(listener) {
      listeners.push(listener);
      return () => { listeners = listeners.filter((candidate) => candidate !== listener); };
    },

    async enriched() {
      const data = await loadProducts();
      const byId = new Map(data.products.map((product) => [product.id, product]));
      const rawItems = readRaw();
      const quantityByProduct = rawItems.reduce((map, item) => {
        map[item.product_id] = (map[item.product_id] || 0) + item.quantity;
        return map;
      }, {});

      const lines = rawItems.map((item) => {
        const product = byId.get(item.product_id);
        if (!product) {
          return {
            ...item,
            line_key: lineKey(item),
            name: 'Producto no disponible',
            image: null,
            unit_price_cents: 0,
            subtotal_cents: 0,
            blocked: true,
            needs_options: false,
          };
        }
        const colors = allowedValues(product, 'colores');
        const models = allowedValues(product, 'modelos');
        const needsOptions = (colors.length > 0 && !colors.includes(item.variant_color))
          || (models.length > 0 && !models.includes(item.variant_model));
        const totalQuantity = quantityByProduct[item.product_id];
        const wholesale = Number.isInteger(product.wholesale_cents)
          && Number.isInteger(product.wholesale_min_qty)
          && totalQuantity >= product.wholesale_min_qty;
        const unitCents = wholesale ? product.wholesale_cents : product.price_cents;
        const status = typeof product.status === 'string' ? product.status.trim().toLocaleLowerCase('es') : '';
        const blocked = ['agotado', 'próximamente', 'proximamente'].includes(status);
        const image = Array.isArray(product.images) && typeof product.images[0] === 'string'
          && /^assets\/img\/[A-Za-z0-9._()\s/-]+$/.test(product.images[0]) ? product.images[0] : null;
        return {
          ...item,
          line_key: lineKey(item),
          name: product.name,
          image,
          status: product.status,
          unit_price_cents: unitCents,
          subtotal_cents: unitCents * item.quantity,
          wholesale_applied: wholesale,
          blocked,
          needs_options: needsOptions,
        };
      });

      return {
        lines,
        subtotalCents: lines.reduce((sum, line) => sum + line.subtotal_cents, 0),
        canCheckout: lines.length > 0 && lines.every((line) => !line.blocked && !line.needs_options),
      };
    },

    formatCents(cents) {
      const numeric = Number.isFinite(Number(cents)) ? Math.trunc(Number(cents)) : 0;
      const sign = numeric < 0 ? '-' : '';
      const absolute = Math.abs(numeric);
      return `${sign}S/ ${Math.floor(absolute / 100).toLocaleString('es-PE')}.${String(absolute % 100).padStart(2, '0')}`;
    },

    getCheckoutIdempotencyKey() {
      let token = sessionStorage.getItem(IDEMPOTENCY_KEY);
      if (!token) {
        token = randomToken();
        sessionStorage.setItem(IDEMPOTENCY_KEY, token);
      }
      return token;
    },

    getOrderAccessToken() {
      let token = sessionStorage.getItem(ACCESS_KEY);
      if (!token) {
        token = randomToken();
        sessionStorage.setItem(ACCESS_KEY, token);
      }
      return token;
    },

    rememberLastOrder(orderNumber, accessToken) {
      sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify({
        order_number: String(orderNumber || ''),
        access_token: String(accessToken || ''),
      }));
    },

    getLastOrder() {
      try {
        const value = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) || 'null');
        if (!value || typeof value.order_number !== 'string' || typeof value.access_token !== 'string') return null;
        return value;
      } catch (_error) {
        return null;
      }
    },
  };

  window.Cart = Cart;
})(window);
