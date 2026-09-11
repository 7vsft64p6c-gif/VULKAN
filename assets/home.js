(function () {
  'use strict';

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function orderable(product) {
    const status = typeof product.status === 'string' ? product.status.toLocaleLowerCase('es') : '';
    return !['agotado', 'próximamente', 'proximamente'].includes(status);
  }

  function hasOptions(product) {
    return (Array.isArray(product.colores) && product.colores.length > 0)
      || (Array.isArray(product.modelos) && product.modelos.length > 0);
  }

  function safeImage(product) {
    const source = Array.isArray(product.images) ? product.images[0] : null;
    return typeof source === 'string' && /^assets\/img\/[A-Za-z0-9._()\s/-]+$/.test(source) ? source : null;
  }

  function productCard(product, categories) {
    const article = node('article', 'product-card');
    const media = node('div', 'product-media');
    const imageSource = safeImage(product);
    if (imageSource) {
      const image = document.createElement('img');
      image.src = imageSource;
      image.alt = product.name;
      image.width = 800;
      image.height = 800;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        media.replaceChildren(node('span', 'image-fallback', 'Imagen no disponible'));
      }, { once: true });
      media.appendChild(image);
    } else media.appendChild(node('span', 'image-fallback', 'Imagen no disponible'));
    if (product.status) {
      const status = node('span', `status-pill${product.status === 'Últimas unidades' ? ' is-low' : ''}`, product.status);
      media.appendChild(status);
    }

    const body = node('div', 'product-body');
    body.appendChild(node('p', 'product-category mono', categories[product.category] || product.category));
    body.appendChild(node('h3', '', product.name));
    body.appendChild(node('p', 'product-description', product.desc || 'Consulta compatibilidad, contenido y disponibilidad antes de confirmar.'));
    const prices = node('div', 'product-price');
    prices.appendChild(node('strong', '', Cart.formatCents(product.price_cents)));
    if (Number.isInteger(product.wholesale_cents)) {
      prices.appendChild(node('span', 'mono', `${Cart.formatCents(product.wholesale_cents)} desde ${product.wholesale_min_qty} u.`));
    }
    body.appendChild(prices);

    const actions = node('div', 'product-actions');
    const detail = node('a', 'button button-secondary', hasOptions(product) ? 'Elegir opciones' : 'Ver detalle');
    detail.href = `catalogo.html?producto=${encodeURIComponent(product.id)}`;
    actions.appendChild(detail);
    if (!hasOptions(product) && orderable(product)) {
      const add = node('button', 'button button-primary', 'Agregar');
      add.type = 'button';
      add.addEventListener('click', () => {
        if (!Cart.addItem(product.id, 1)) return;
        add.textContent = 'Agregado';
        window.setTimeout(() => { add.textContent = 'Agregar'; }, 900);
      });
      actions.appendChild(add);
    }
    body.appendChild(actions);
    article.append(media, body);
    return article;
  }

  function renderProducts(container, products, categories) {
    container.replaceChildren();
    products.forEach((product) => container.appendChild(productCard(product, categories)));
    if (!products.length) container.appendChild(node('p', 'muted', 'No hay productos para mostrar en esta selección.'));
  }

  async function init() {
    const featured = document.getElementById('homeFeatured');
    const wholesale = document.getElementById('homeWholesale');
    const categoriesContainer = document.getElementById('homeCategories');
    try {
      const response = await fetch(new URL('products.json', document.baseURI), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('catalog');
      const data = await response.json();
      if (!data || !Array.isArray(data.products) || !data.categories) throw new Error('shape');

      const count = document.getElementById('homeProductCount');
      if (count) count.textContent = `${data.products.length} productos`;
      const selectable = data.products.filter((product) => orderable(product) && safeImage(product));
      const firstSelection = selectable.slice(0, 4);
      renderProducts(featured, firstSelection, data.categories);
      renderProducts(wholesale, selectable.filter((product) => Number.isInteger(product.wholesale_cents)).slice(8, 12), data.categories);
      categoriesContainer.replaceChildren();
      Object.entries(data.categories).forEach(([slug, label]) => {
        const link = node('a', 'category-card');
        link.href = `catalogo.html?categoria=${encodeURIComponent(slug)}`;
        link.append(node('h3', '', label));
        const amount = data.products.filter((product) => product.category === slug).length;
        link.append(node('span', 'mono', `${amount} producto${amount === 1 ? '' : 's'}`));
        categoriesContainer.appendChild(link);
      });
    } catch (_error) {
      [featured, wholesale, categoriesContainer].forEach((container) => {
        if (container) container.replaceChildren(node('p', 'form-error', 'No pudimos cargar esta sección del catálogo.'));
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
