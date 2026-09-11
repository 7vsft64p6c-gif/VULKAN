(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    loading: $('accountLoading'), public: $('publicAccount'), private: $('privateAccount'),
    loginTab: $('loginTab'), registerTab: $('registerTab'), loginPanel: $('loginPanel'), registerPanel: $('registerPanel'),
    recoveryPanel: $('recoveryPanel'), resetPanel: $('resetPanel'), orders: $('accountOrders'),
  };
  let csrfToken = '';
  let currentUser = null;
  let resetToken = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setMessage(name, text, success = false) {
    const output = document.querySelector(`[data-message="${name}"]`);
    if (!output) return;
    output.textContent = text;
    output.className = `form-message ${success ? 'form-success' : 'form-error'}`;
  }

  async function parseResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('El servicio de cuenta no está disponible.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
    return data;
  }

  async function request(path, method = 'GET', body = null) {
    const options = { method, credentials: 'same-origin', headers: {} };
    if (body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['X-CSRF-Token'] = csrfToken;
      options.body = JSON.stringify(body);
    }
    return parseResponse(await fetch(new URL(path, document.baseURI), options));
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function switchTab(name) {
    const login = name === 'login';
    ui.loginTab.setAttribute('aria-selected', String(login));
    ui.registerTab.setAttribute('aria-selected', String(!login));
    ui.loginPanel.hidden = !login;
    ui.registerPanel.hidden = login;
    (login ? $('loginEmail') : $('registerName')).focus();
  }

  function fillProfile(user) {
    $('accountName').textContent = user.name;
    $('accountRole').textContent = user.role === 'ADMIN' ? 'Cuenta administradora' : 'Cuenta cliente';
    $('profileName').value = user.name || '';
    $('profilePhone').value = user.phone || '';
    $('profileMethod').value = user.shipping_method || '';
    $('profileCity').value = user.shipping_city || '';
    $('profileAddress').value = user.shipping_address || '';
    $('profileReference').value = user.shipping_reference || '';
  }

  function showState() {
    ui.loading.hidden = true;
    if (resetToken) {
      ui.public.hidden = false;
      ui.private.hidden = true;
      ui.loginPanel.hidden = true;
      ui.registerPanel.hidden = true;
      ui.recoveryPanel.hidden = true;
      ui.resetPanel.hidden = false;
      $('resetPassword').focus();
      return;
    }
    ui.resetPanel.hidden = true;
    ui.public.hidden = Boolean(currentUser);
    ui.private.hidden = !currentUser;
    if (currentUser) {
      fillProfile(currentUser);
      loadOrders();
    } else {
      ui.loginPanel.hidden = false;
      ui.recoveryPanel.hidden = true;
    }
  }

  function statusLabel(status) {
    return ({ PENDING: 'Pedido recibido', PAYMENT_PROCESSING: 'Procesando pago', PAID: 'Pagado', FAILED: 'No pagado', CANCELLED: 'Cancelado', REFUNDED: 'Reembolsado' })[status] || status;
  }

  async function loadOrders() {
    ui.orders.replaceChildren(node('p', 'muted', 'Cargando pedidos…'));
    try {
      const data = await request('api/orders/list.php');
      ui.orders.replaceChildren();
      if (!data.orders.length) {
        ui.orders.appendChild(node('p', 'muted', 'Todavía no hay pedidos asociados a tu cuenta.'));
        return;
      }
      data.orders.forEach((order) => {
        const link = node('a', 'order-list-item');
        link.href = `order.html?order=${encodeURIComponent(order.order_number)}`;
        const info = node('span', '', order.order_number);
        info.appendChild(node('small', '', `${statusLabel(order.status)} · ${order.created_at}`));
        link.append(info, node('strong', 'mono', Cart.formatCents(order.total_cents)));
        ui.orders.appendChild(link);
      });
    } catch (error) {
      ui.orders.replaceChildren(node('p', 'form-error', error.message));
    }
  }

  async function init() {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    resetToken = fragment.get('reset') || url.searchParams.get('reset');
    if (resetToken) {
      fragment.delete('reset');
      url.searchParams.delete('reset');
      url.hash = fragment.toString() ? `#${fragment.toString()}` : '';
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    try {
      const session = await request('api/session.php');
      csrfToken = session.csrf_token || '';
      currentUser = session.user || null;
      showState();
    } catch (error) {
      ui.loading.replaceChildren(node('p', 'form-error', error.message));
      return;
    }

    ui.loginTab.addEventListener('click', () => switchTab('login'));
    ui.registerTab.addEventListener('click', () => switchTab('register'));
    $('showRecovery').addEventListener('click', () => {
      ui.recoveryPanel.hidden = false;
      $('recoveryEmail').focus();
    });

    $('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('login', 'Comprobando…', true);
      try {
        const data = await request('api/auth/login.php', 'POST', formValues(event.currentTarget));
        csrfToken = data.csrf_token;
        currentUser = data.user;
        event.currentTarget.reset();
        showState();
      } catch (error) { setMessage('login', error.message); }
    });

    $('registerForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('register', 'Creando cuenta…', true);
      try {
        const data = await request('api/auth/register.php', 'POST', formValues(event.currentTarget));
        csrfToken = data.csrf_token;
        currentUser = data.user;
        event.currentTarget.reset();
        showState();
      } catch (error) { setMessage('register', error.message); }
    });

    $('recoveryForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await request('api/auth/request-reset.php', 'POST', formValues(event.currentTarget));
        let message = data.message;
        if (data.development_token) message += ` Token de desarrollo: ${data.development_token}`;
        setMessage('recovery', message, true);
      } catch (error) { setMessage('recovery', error.message); }
    });

    $('resetForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await request('api/auth/reset-password.php', 'POST', { token: resetToken, ...formValues(event.currentTarget) });
        setMessage('reset', 'Contraseña actualizada. Ya puedes iniciar sesión.', true);
        resetToken = null;
        window.setTimeout(() => {
          ui.resetPanel.hidden = true;
          ui.loginPanel.hidden = false;
          switchTab('login');
        }, 700);
      } catch (error) { setMessage('reset', error.message); }
    });

    $('profileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await request('api/auth/profile.php', 'POST', formValues(event.currentTarget));
        currentUser = data.user;
        fillProfile(currentUser);
        setMessage('profile', 'Perfil guardado.', true);
      } catch (error) { setMessage('profile', error.message); }
    });

    $('passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await request('api/auth/change-password.php', 'POST', formValues(event.currentTarget));
        csrfToken = data.csrf_token;
        event.currentTarget.reset();
        setMessage('password', 'Contraseña actualizada y otras sesiones invalidadas.', true);
      } catch (error) { setMessage('password', error.message); }
    });

    $('logoutButton').addEventListener('click', async () => {
      try {
        await request('api/auth/logout.php', 'POST', {});
        window.location.reload();
      } catch (error) {
        ui.orders.prepend(node('p', 'form-error', error.message));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
