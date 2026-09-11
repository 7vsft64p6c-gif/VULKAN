(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  function initIntro() {
    const intro = document.getElementById('vulkanIntro');
    if (!intro) return;
    let seen = false;
    try { seen = sessionStorage.getItem('vulkan_intro_seen') === '1'; } catch (_error) { /* continúa */ }
    if (seen || reduceMotion) {
      intro.remove();
      return;
    }

    const previousFocus = document.activeElement;
    const skip = intro.querySelector('.intro-skip');
    const dismiss = () => {
      if (intro.classList.contains('is-leaving')) return;
      try { sessionStorage.setItem('vulkan_intro_seen', '1'); } catch (_error) { /* no bloquea */ }
      intro.classList.add('is-leaving');
      document.body.classList.remove('intro-running');
      window.setTimeout(() => intro.remove(), 520);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };

    document.body.classList.add('intro-running');
    if (skip) {
      skip.addEventListener('click', dismiss);
      skip.focus();
    }
    intro.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismiss();
    });
    window.setTimeout(dismiss, 1450);
  }

  function initNavigation() {
    const nav = document.querySelector('.site-nav');
    const menu = document.getElementById('primaryNav');
    const toggle = document.getElementById('menuToggle');
    if (nav) {
      let scheduled = false;
      const update = () => {
        nav.classList.toggle('is-scrolled', window.scrollY > 18);
        scheduled = false;
      };
      window.addEventListener('scroll', () => {
        if (!scheduled) {
          scheduled = true;
          requestAnimationFrame(update);
        }
      }, { passive: true });
      update();
    }
    if (!menu || !toggle) return;

    const media = window.matchMedia('(max-width: 760px)');
    let open = false;
    const sync = () => {
      const mobile = media.matches;
      menu.hidden = mobile && !open;
      if ('inert' in menu) menu.inert = mobile && !open;
      toggle.setAttribute('aria-expanded', String(mobile && open));
    };
    const close = (restoreFocus = false) => {
      open = false;
      sync();
      if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      open = !open;
      sync();
      if (open) menu.querySelector('a')?.focus();
    });
    menu.addEventListener('click', (event) => {
      if (media.matches && event.target.closest('a')) close(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) close(true);
    });
    media.addEventListener('change', () => {
      open = false;
      sync();
    });
    sync();
  }

  function initHeroMotion() {
    const hero = document.querySelector('.hero-v2');
    const image = hero?.querySelector('.hero-media img');
    if (!hero || !image || reduceMotion) return;
    let x = 0;
    let y = 0;
    let scroll = 0;
    let scheduled = false;
    const paint = () => {
      image.style.setProperty('--hero-x', `${x}px`);
      image.style.setProperty('--hero-y', `${y}px`);
      image.style.setProperty('--hero-scroll', String(scroll));
      scheduled = false;
    };
    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(paint);
      }
    };
    if (finePointer) {
      hero.addEventListener('pointermove', (event) => {
        const rect = hero.getBoundingClientRect();
        x = ((event.clientX - rect.left) / rect.width - 0.5) * -10;
        y = ((event.clientY - rect.top) / rect.height - 0.5) * -7;
        schedule();
      }, { passive: true });
    }
    window.addEventListener('scroll', () => {
      scroll = Math.min(26, Math.max(0, -hero.getBoundingClientRect().top) * 0.035);
      schedule();
    }, { passive: true });
  }

  function initEmbers() {
    const canvas = document.getElementById('emberCanvas');
    const hero = document.querySelector('.hero-v2');
    if (!canvas || !hero || reduceMotion) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    const memory = Number(navigator.deviceMemory || 4);
    const compact = window.matchMedia('(max-width: 820px)').matches;
    const maximum = memory <= 2 ? 8 : (compact ? 12 : 24);
    const particles = [];
    let width = 1;
    let height = 1;
    let frame = 0;
    let visible = true;
    let last = 0;

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const add = (px, py, burst) => {
      if (particles.length >= maximum + 8) particles.shift();
      particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * (burst ? 0.9 : 0.35),
        vy: -(0.18 + Math.random() * (burst ? 0.9 : 0.48)),
        life: 0,
        ttl: 55 + Math.random() * 70,
        size: 0.7 + Math.random() * (burst ? 1.7 : 1.1),
      });
    };
    const draw = (time) => {
      if (!visible) return;
      frame = requestAnimationFrame(draw);
      if (document.hidden || time - last < 32) return;
      last = time;
      context.clearRect(0, 0, width, height);
      if (particles.length < maximum && Math.random() > 0.45) {
        add(width * (0.58 + Math.random() * 0.34), height * (0.58 + Math.random() * 0.24), false);
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.life += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        const alpha = Math.max(0, 1 - particle.life / particle.ttl);
        context.beginPath();
        context.fillStyle = `rgba(255, ${110 + Math.round(alpha * 68)}, 45, ${alpha * 0.72})`;
        context.shadowColor = 'rgba(255, 90, 31, .7)';
        context.shadowBlur = 7;
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
        if (particle.life >= particle.ttl) particles.splice(index, 1);
      }
      context.shadowBlur = 0;
    };

    if (finePointer) {
      let lastSpark = 0;
      hero.addEventListener('pointermove', (event) => {
        const now = performance.now();
        if (now - lastSpark < 58) return;
        const rect = hero.getBoundingClientRect();
        add(event.clientX - rect.left, event.clientY - rect.top, true);
        lastSpark = now;
      }, { passive: true });
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) frame = requestAnimationFrame(draw);
    }, { threshold: 0.01 });
    observer.observe(hero);
    resize();
    window.addEventListener('resize', resize, { passive: true });
    frame = requestAnimationFrame(draw);
    window.addEventListener('pagehide', () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    }, { once: true });
  }

  function init() {
    initIntro();
    initNavigation();
    initHeroMotion();
    initEmbers();
    if (!document.querySelector('link[rel="canonical"]') && /^https?:$/.test(window.location.protocol)) {
      const canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = new URL(window.location.pathname, window.location.origin).href;
      document.head.appendChild(canonical);
    }
    document.querySelectorAll('[data-current-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
