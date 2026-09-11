(function () {
  'use strict';

  const state = { products: [], categories: {}, category: 'all', search: '', availability: 'all', sort: 'catalog' };
  let currentProduct = null;
  let selectedColor = null;
  let selectedModel = null;
  let returnFocus = null;

  const $ = (id) => document.getElementById(id);
  const ui = {
    grid: $('productGrid'), search: $('catalogSearch'), count: $('resultCount'), chips: $('categoryChips'),
    availability: $('availabilityFilter'), sort: $('sortProducts'), overlay: $('productOverlay'),
    dialog: $('productDialog'), close: $('dialogClose'), media: $('dialogMedia'), thumbnails: $('dialogThumbnails'),
    category: $('dialogCategory'), title: $('dialogTitle'), description: $('dialogDescription'),
    price: $('dialogPrice'), wholesale: $('dialogWholesale'), status: $('dialogStatus'),
    colorGroup: $('colorGroup'), colors: $('colorOptions'), modelGroup: $('modelGroup'), models: $('modelOptions'),
    quantity: $('dialogQuantity'), add: $('dialogAdd'), checkout: $('dialogCheckout'),
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function safeImage(value) {
    return typeof value === 'string' && /^assets\/img\/[A-Za-z0-9._()\s/-]+$/.test(value) ? value : null;
  }

  function isOrderable(product) {
    const status = typeof product.status === 'string' ? product.status.toLocaleLowerCase('es') : '';
    return !['agotado', 'próximamente', 'proximamente'].includes(status);
  }

  function hasOptions(product) {
    return (Array.isArray(product.colores) && product.colores.length > 0)
      || (Array.isArray(product.modelos) && product.modelos.length > 0);
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  }

  function productImage(product, loading = 'lazy') {
    const wrapper = node('div', loading === 'lazy' ? 'product-media' : 'dialog-media');
    const source = safeImage(Array.isArray(product.images) ? product.images[0] : null);
    if (!source) {
      wrapper.appendChild(node('span', 'image-fallback', 'Imagen no disponible'));
      return wrapper;
    }
    const image = document.createElement('img');
    image.src = source;
    image.alt = product.name;
    image.width = 800;
    image.height = 800;
    image.loading = loading;
    image.decoding = 'async';
    image.addEventListener('error', () => wrapper.replaceChildren(node('span', 'image-fallback', 'Imagen no disponible')), { once: true });
    wrapper.appendChild(image);
    return wrapper;
  }

  function makeCard(product) {
    const article = node('article', 'product-card');
    const media = productImage(product);
    if (product.status) {
      let style = '';
      if (product.status === 'Últimas unidades') style = ' is-low';
      if (!isOrderable(product)) style = ' is-blocked';
      media.appendChild(node('span', `status-pill${style}`, product.status));
    }
    const body = node('div', 'product-body');
    body.appendChild(node('p', 'product-category mono', state.categories[product.category] || product.category));
    body.appendChild(node('h3', '', product.name));
    body.appendChild(node('p', 'product-description', product.desc || 'Consulta compatibilidad, contenido y disponibilidad antes de confirmar.'));
    const price = node('div', 'product-price');
    price.appendChild(node('strong', '', Cart.formatCents(product.price_cents)));
    if (Number.isInteger(product.wholesale_cents)) {
      price.appendChild(node('span', 'mono', `${Cart.formatCents(product.wholesale_cents)} desde ${product.wholesale_min_qty} u.`));
    }
    body.appendChild(price);

    const actions = node('div', 'product-actions');
    const detail = node('button', 'button button-secondary', hasOptions(product) ? 'Elegir opciones' : 'Ver detalle');
    detail.type = 'button';
    detail.addEventListener('click', () => openDialog(product, detail));
    actions.appendChild(detail);
    const add = node('button', 'button button-primary', hasOptions(product) ? 'Configurar' : 'Agregar');
    add.type = 'button';
    add.disabled = !isOrderable(product);
    add.addEventListener('click', () => {
      if (hasOptions(product)) openDialog(product, add);
      else if (Cart.addItem(product.id, 1)) {
        add.textContent = 'Agregado';
        window.setTimeout(() => { add.textContent = 'Agregar'; }, 900);
      }
    });
    actions.appendChild(add);
    body.appendChild(actions);
    article.append(media, body);
    return article;
  }

  function filteredProducts() {
    const query = normalize(state.search);
    const filtered = state.products.filter((product) => {
      if (state.category !== 'all' && product.category !== state.category) return false;
      if (query && !normalize(product.name).includes(query)) return false;
      if (state.availability === 'orderable' && !isOrderable(product)) return false;
      if (state.availability === 'blocked' && isOrderable(product)) return false;
      return true;
    });
    if (state.sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (state.sort === 'price-asc') filtered.sort((a, b) => a.price_cents - b.price_cents);
    if (state.sort === 'price-desc') filtered.sort((a, b) => b.price_cents - a.price_cents);
    return filtered;
  }

  function render() {
    const products = filteredProducts();
    ui.grid.replaceChildren();
    products.forEach((product) => ui.grid.appendChild(makeCard(product)));
    if (!products.length) ui.grid.appendChild(node('p', 'muted', 'No encontramos productos con esos filtros.'));
    ui.grid.setAttribute('aria-busy', 'false');
    ui.count.textContent = `${products.length} de ${state.products.length}`;
  }

  function updateCategoryUrl() {
    const url = new URL(window.location.href);
    if (state.category === 'all') url.searchParams.delete('categoria');
    else url.searchParams.set('categoria', state.category);
    url.searchParams.delete('producto');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function renderChips() {
    ui.chips.replaceChildren();
    const entries = [['all', 'Todo'], ...Object.entries(state.categories)];
    entries.forEach(([slug, label]) => {
      const button = node('button', 'chip', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.category === slug));
      button.addEventListener('click', () => {
        state.category = slug;
        ui.chips.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip === button)));
        updateCategoryUrl();
        render();
      });
      ui.chips.appendChild(button);
    });
  }

  function colorValues(product) {
    return (Array.isArray(product.colores) ? product.colores : [])
      .filter((entry) => entry && typeof entry.nombre === 'string' && entry.nombre.trim());
  }

  function modelValues(product) {
    return (Array.isArray(product.modelos) ? product.modelos : [])
      .filter((entry) => typeof entry === 'string' && entry.trim());
  }

  function setMainImage(source) {
    ui.media.replaceChildren();
    if (!source) {
      ui.media.appendChild(node('span', 'image-fallback', 'Imagen no disponible'));
      return;
    }
    const image = document.createElement('img');
    image.src = source;
    image.alt = currentProduct?.name || '';
    image.width = 800;
    image.height = 800;
    image.decoding = 'async';
    image.addEventListener('error', () => ui.media.replaceChildren(node('span', 'image-fallback', 'Imagen no disponible')), { once: true });
    ui.media.appendChild(image);
  }

  function updateDialogPrice() {
    if (!currentProduct) return;
    const requested = Math.max(1, Math.min(999, Number.parseInt(ui.quantity.value, 10) || 1));
    const inCart = Cart.getItems().filter((item) => item.product_id === currentProduct.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    const total = requested + inCart;
    const wholesale = Number.isInteger(currentProduct.wholesale_cents)
      && Number.isInteger(currentProduct.wholesale_min_qty)
      && total >= currentProduct.wholesale_min_qty;
    const unit = wholesale ? currentProduct.wholesale_cents : currentProduct.price_cents;
    ui.price.textContent = Cart.formatCents(unit * requested);
    ui.wholesale.textContent = wholesale
      ? `Precio mayorista aplicado a ${total} u. totales`
      : `${Cart.formatCents(currentProduct.wholesale_cents)} por unidad desde ${currentProduct.wholesale_min_qty}`;
  }

  function updateDialogActions() {
    if (!currentProduct) return;
    const complete = (colorValues(currentProduct).length === 0 || selectedColor)
      && (modelValues(currentProduct).length === 0 || selectedModel);
    const enabled = isOrderable(currentProduct) && Boolean(complete);
    ui.add.disabled = !enabled;
    ui.checkout.disabled = !enabled;
  }

  function renderOptions() {
    const colors = colorValues(currentProduct);
    ui.colorGroup.hidden = colors.length === 0;
    ui.colors.replaceChildren();
    colors.forEach((entry) => {
      const button = node('button', 'option-button', entry.nombre.trim());
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        selectedColor = entry.nombre.trim();
        ui.colors.querySelectorAll('button').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        const image = safeImage(entry.imagen);
        if (image) setMainImage(image);
        updateDialogActions();
      });
      ui.colors.appendChild(button);
    });

    const models = modelValues(currentProduct);
    ui.modelGroup.hidden = models.length === 0;
    ui.models.replaceChildren();
    models.forEach((value) => {
      const button = node('button', 'option-button', value.trim());
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        selectedModel = value.trim();
        ui.models.querySelectorAll('button').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        updateDialogActions();
      });
      ui.models.appendChild(button);
    });
  }

  function openDialog(product, source) {
    currentProduct = product;
    selectedColor = null;
    selectedModel = null;
    returnFocus = source || document.activeElement;
    ui.category.textContent = state.categories[product.category] || product.category;
    ui.title.textContent = product.name;
    ui.description.textContent = product.desc || 'Consulta compatibilidad, contenido y disponibilidad antes de confirmar.';
    ui.quantity.value = '1';
    ui.status.textContent = product.status || 'Disponibilidad por confirmar';
    ui.status.className = isOrderable(product) ? 'form-message' : 'form-message form-error';

    const images = (Array.isArray(product.images) ? product.images : []).map(safeImage).filter(Boolean);
    setMainImage(images[0] || null);
    ui.thumbnails.replaceChildren();
    if (images.length > 1) images.forEach((sourceValue, index) => {
      const button = node('button', 'option-button', `Vista ${index + 1}`);
      button.type = 'button';
      button.addEventListener('click', () => setMainImage(sourceValue));
      ui.thumbnails.appendChild(button);
    });
    renderOptions();
    updateDialogPrice();
    updateDialogActions();

    ui.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    ui.dialog.focus();
    const url = new URL(window.location.href);
    url.searchParams.set('producto', product.id);
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function closeDialog() {
    if (ui.overlay.hidden) return;
    ui.overlay.hidden = true;
    document.body.style.overflow = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('producto');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    currentProduct = null;
  }

  function addCurrent(goToCheckout) {
    if (!currentProduct || ui.add.disabled) return;
    const quantity = Math.max(1, Math.min(999, Number.parseInt(ui.quantity.value, 10) || 1));
    Cart.addItem(currentProduct.id, quantity, { variant_color: selectedColor, variant_model: selectedModel });
    if (goToCheckout) {
      window.location.href = 'checkout.html';
      return;
    }
    ui.status.textContent = 'Agregado al carrito.';
    ui.status.className = 'form-message form-success';
    ui.add.textContent = 'Agregado';
    window.setTimeout(() => { ui.add.textContent = 'Agregar al carrito'; }, 900);
  }

  function dialogFocusable() {
    return Array.from(ui.dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
  }

  async function init() {
    try {
      const response = await fetch(new URL('products.json', document.baseURI), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('catalog');
      const data = await response.json();
      if (!data || !Array.isArray(data.products) || !data.categories) throw new Error('shape');
      state.products = data.products;
      state.categories = data.categories;
      const params = new URLSearchParams(window.location.search);
      const category = params.get('categoria');
      if (category && Object.hasOwn(state.categories, category)) state.category = category;
      const heroCount = document.getElementById('catalogHeroCount');
      if (heroCount) heroCount.textContent = `${state.products.length} referencias en catálogo`;
      renderChips();
      render();
      const requestedProduct = params.get('producto');
      const product = requestedProduct && state.products.find((item) => item.id === requestedProduct);
      if (product) openDialog(product, null);
    } catch (_error) {
      ui.grid.setAttribute('aria-busy', 'false');
      ui.grid.replaceChildren(node('p', 'form-error', 'No pudimos cargar el catálogo. Inténtalo nuevamente.'));
      ui.count.textContent = 'No disponible';
    }

    ui.search.addEventListener('input', () => { state.search = ui.search.value; render(); });
    ui.availability.addEventListener('change', () => { state.availability = ui.availability.value; render(); });
    ui.sort.addEventListener('change', () => { state.sort = ui.sort.value; render(); });
    ui.close.addEventListener('click', closeDialog);
    ui.overlay.addEventListener('click', (event) => { if (event.target === ui.overlay) closeDialog(); });
    ui.quantity.addEventListener('input', updateDialogPrice);
    ui.add.addEventListener('click', () => addCurrent(false));
    ui.checkout.addEventListener('click', () => addCurrent(true));
    ui.dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = dialogFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
