/* global Telegram */

const state = {
  selectedDateISO: null,
  todayISO: null,
  pillsByDate: {},
  pillsPlanByDate: {},
};

const PILLS_STORAGE_KEY = 'mymetrica:pills:v1';

function $(sel, root = document) {
  return root.querySelector(sel);
}

function formatRuDayMonth(iso) {
  const [y, m, d] = iso.split('-').map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(dt);
}

function getPillsTitle(iso) {
  const todayISO = state.todayISO || toISODate(new Date());
  if (iso === todayISO) return 'На сегодня';

  const [y, m, d] = todayISO.split('-').map((x) => Number(x));
  const todayDate = new Date(y, m - 1, d);
  const tomorrowISO = toISODate(addDays(todayDate, 1));
  if (iso === tomorrowISO) return 'На завтра';

  return `На ${formatRuDayMonth(iso)}`;
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);
  const ms = Math.max(250, next.getTime() - now.getTime());

  setTimeout(() => {
    const prevToday = state.todayISO;
    state.todayISO = toISODate(new Date());

    if (prevToday && state.selectedDateISO === prevToday) {
      state.selectedDateISO = state.todayISO;
    }

    renderCalendar();
    scheduleMidnightRefresh();
  }, ms);
}

function loadPillsStorage() {
  try {
    const raw = localStorage.getItem(PILLS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function syncPillsFromStorage() {
  const data = loadPillsStorage();
  const map = {};
  const plan = {};

  Object.entries(data).forEach(([iso, items]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (!Array.isArray(items) || items.length === 0) return;
    map[iso] = true;
    plan[iso] = items;
  });

  state.pillsByDate = map;
  state.pillsPlanByDate = plan;
}

function getInitialSelectedISO() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  } catch {
    // ignore
  }
  return null;
}

function initStorageSync() {
  const refresh = () => {
    syncPillsFromStorage();
    renderCalendar();
  };

  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function toISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, 1800);
}

function applyUserName() {
  const nameEl = $('#currentName');
  const avatarEl = $('.avatar');
  if (!nameEl) return;

  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try {
    const user = tg.initDataUnsafe?.user;
    if (user?.first_name) {
      nameEl.textContent = user.first_name;
    }
    
    // Always try to apply avatar if available
    if (user?.photo_url && avatarEl) {
      const img = document.createElement('img');
      img.src = user.photo_url;
      img.alt = user.first_name || 'Аватар';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
      
      // Add error handling
      img.onerror = () => {
        console.log('Failed to load user avatar, keeping default');
        // Keep default SVG avatar if image fails to load
      };
      
      img.onload = () => {
        console.log('User avatar loaded successfully');
      };
      
      avatarEl.innerHTML = '';
      avatarEl.appendChild(img);
    } else {
      // Ensure default avatar is shown if no photo
      if (avatarEl && !avatarEl.querySelector('svg')) {
        avatarEl.innerHTML = `
          <svg class="avatar__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 12a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M5.5 20a6.5 6.5 0 0113 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        `;
      }
    }
  } catch (error) {
    console.log('Error applying user data:', error);
  }
}

// Listen for Telegram user data updates
function setupAvatarUpdates() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  // Listen for user data changes
  tg.onEvent('userChanged', () => {
    console.log('User data changed, updating avatar');
    applyUserName();
  });

  // Also check periodically for avatar changes (fallback)
  let lastPhotoUrl = tg.initDataUnsafe?.user?.photo_url;
  
  setInterval(() => {
    const currentPhotoUrl = tg.initDataUnsafe?.user?.photo_url;
    if (currentPhotoUrl !== lastPhotoUrl) {
      console.log('Avatar URL changed, updating');
      lastPhotoUrl = currentPhotoUrl;
      applyUserName();
    }
  }, 5000); // Check every 5 seconds
}

function initHeader() {
  // Apply user data
  applyUserName();
  
  // Setup avatar update monitoring
  setupAvatarUpdates();
  
  // Setup event listeners for header actions
  document.addEventListener('click', (e) => {
    const target = e.target?.closest?.('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
      case 'support':
        if (window.Telegram?.WebApp?.openTelegramLink) {
          Telegram.WebApp.openTelegramLink('https://t.me/mymetrica_help');
        } else if (window.Telegram?.WebApp?.openLink) {
          Telegram.WebApp.openLink('https://t.me/mymetrica_help');
        } else {
          window.open('https://t.me/mymetrica_help', '_blank');
        }
        break;
      case 'notifications':
        toast('Пока нет уведомлений');
        break;
      default:
        break;
    }
  });
}

function initPillsEmptyState() {
  const today = new Date();
  state.pillsByDate = {};
  state.pillsPlanByDate = {};
  state.todayISO = toISODate(today);
  state.selectedDateISO = state.todayISO;

  const initial = getInitialSelectedISO();
  if (initial) state.selectedDateISO = initial;
}

function renderPillsSummary() {
  const el = $('#pillsSummary');
  if (!el) return;

  const iso = state.selectedDateISO;
  const items = state.pillsPlanByDate[iso] || [];

  // Sort items by time
  items.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

  if (items.length === 0) {
    el.innerHTML = `
      <div class="pills-carousel">
        <div class="pill-card pill-card--empty" role="button" onclick="window.location.href='pills.html?date=${iso}'">
          <div class="pill-card__info" style="align-items:center; text-align:center; width:100%">
            <div class="pill-card__name" style="color:var(--muted); font-size:14px;">Нет приёмов</div>
            <div class="pill-card__meta" style="white-space:normal; margin-top:2px;">Нажмите, чтобы добавить</div>
          </div>
        </div>
      </div>
    `.trim();
    return;
  }

  const cardsHtml = items
    .map((p) => {
      return `
        <div class="pill-card" role="button" onclick="window.location.href='pills.html?date=${iso}'">
          <div class="pill-card__time">${p.time}</div>
          <div class="pill-card__info">
            <div class="pill-card__name">${p.name}</div>
            <div class="pill-card__meta">${p.meta || ''}</div>
          </div>
        </div>
      `.trim();
    })
    .join('');

  el.innerHTML = `
    <div class="pills-carousel">
      ${cardsHtml}
    </div>
  `.trim();
}

function renderCalendar() {
  const strip = $('#calendarStrip');
  if (!strip) return;

  const today = new Date();
  state.todayISO = toISODate(today);
  const start = addDays(today, -3);
  const daysCount = 14;

  const dow = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  strip.innerHTML = '';
  for (let i = 0; i < daysCount; i += 1) {
    const d = addDays(start, i);
    const iso = toISODate(d);
    const isToday = iso === toISODate(today);
    const isSelected = iso === state.selectedDateISO;
    const hasPills = Boolean(state.pillsByDate[iso]);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${hasPills ? ' has-pills' : ''}`;
    btn.dataset.iso = iso;
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', `${d.getDate()} ${d.getMonth() + 1}`);
    btn.innerHTML = `
      <div class="day__dow">${dow[d.getDay()]}</div>
      <div class="day__num">${d.getDate()}</div>
      <div class="day__dot" aria-hidden="true"></div>
    `.trim();

    strip.appendChild(btn);
  }

  const selected = strip.querySelector('.day.is-selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  renderPillsSummary();
}

function initCalendar() {
  const strip = $('#calendarStrip');
  if (!strip) return;

  strip.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.day');
    if (!btn) return;

    state.selectedDateISO = btn.dataset.iso;
    renderCalendar();

    toast(`План на ${btn.querySelector('.day__num')?.textContent}`);
    if (window.Telegram?.WebApp) {
      Telegram.WebApp.HapticFeedback?.selectionChanged?.();
    }
  });
}

function initActions() {
  document.addEventListener('click', (e) => {
    const target = e.target?.closest?.('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
      case 'close':
        if (window.Telegram?.WebApp) Telegram.WebApp.close();
        else toast('Закрытие доступно внутри Telegram');
        break;
      case 'menu':
        toast('Меню: скоро');
        break;
      case 'support':
        if (window.Telegram?.WebApp?.openTelegramLink) {
          Telegram.WebApp.openTelegramLink('https://t.me/mymetrica_help');
        } else if (window.Telegram?.WebApp?.openLink) {
          Telegram.WebApp.openLink('https://t.me/mymetrica_help');
        } else {
          window.open('https://t.me/mymetrica_help', '_blank');
        }
        break;
      case 'notifications':
        toast('Пока нет уведомлений');
        break;
      case 'balance':
        toast('Баланс: бесплатно без ограничений');
        break;
      case 'add':
        toast('Загрузка анализа: скоро');
        break;
      case 'decode':
        window.location.href = 'decode.html';
        break;
      case 'medcard':
        window.location.href = 'medcard.html';
        break;
      case 'pills':
        window.location.href = `pills.html?date=${encodeURIComponent(state.selectedDateISO)}`;
        break;
      case 'chat':
        toast('Чат ассистента: скоро');
        break;
      case 'referral':
        toast('Рефералы: скоро');
        break;
      case 'invite':
        window.location.href = 'family.html';
        break;
      case 'subscription':
        toast('Подписка: скоро');
        break;
      default:
        toast('Скоро');
    }

    if (window.Telegram?.WebApp) {
      Telegram.WebApp.HapticFeedback?.impactOccurred?.('light');
    }
  });
}

function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const ua = navigator.userAgent || '';
  const isRealTelegram =
    /Telegram/i.test(ua) ||
    (typeof tg.platform === 'string' && tg.platform !== 'unknown') ||
    (typeof tg.initData === 'string' && tg.initData.length > 0) ||
    Boolean(tg.initDataUnsafe?.user);
  if (!isRealTelegram) return;

  const setViewportVar = () => {
    const h = tg.viewportHeight || window.innerHeight;
    document.documentElement.style.setProperty('--tg-viewport-height', `${h}px`);

    const top = tg.safeAreaInset?.top;
    const bottom = tg.safeAreaInset?.bottom;
    const safeTop = typeof top === 'number' ? top : 0;
    const safeBottom = typeof bottom === 'number' ? bottom : 0;
    if (typeof top === 'number') document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
    if (typeof bottom === 'number') document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);

    const ct = tg.contentSafeAreaInset?.top;
    const cr = tg.contentSafeAreaInset?.right;
    const cb = tg.contentSafeAreaInset?.bottom;
    const cl = tg.contentSafeAreaInset?.left;

    const topInset = typeof ct === 'number' && ct > 0 ? ct : safeTop + 52;
    const rightInset = typeof cr === 'number' && cr > 0 ? cr : 0;
    const bottomInset = typeof cb === 'number' && cb > 0 ? cb : safeBottom;
    const leftInset = typeof cl === 'number' && cl > 0 ? cl : 0;

    document.documentElement.style.setProperty('--tg-content-top', `${topInset}px`);
    document.documentElement.style.setProperty('--tg-content-right', `${rightInset}px`);
    document.documentElement.style.setProperty('--tg-content-bottom', `${bottomInset}px`);
    document.documentElement.style.setProperty('--tg-content-left', `${leftInset}px`);
  };

  const expandNow = () => {
    try {
      if (
        typeof tg.requestFullscreen === 'function' &&
        (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.1'))
      ) {
        tg.requestFullscreen();
      }
    } catch {
    }

    try {
      tg.expand?.();
    } catch {
    }
    setViewportVar();
  };

  tg.ready();
  expandNow();
  setTimeout(expandNow, 60);
  setTimeout(expandNow, 300);

  if (typeof tg.onEvent === 'function') {
    tg.onEvent('viewportChanged', expandNow);
  }

  document.documentElement.classList.add('is-telegram');

  try {
    tg.setBackgroundColor?.('#e2e6ed');
    tg.setHeaderColor?.('#eef2f6');
    
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
      tg.MainButton?.hide();
      tg.BackButton?.hide();
    }
  } catch {
  }
}

function main() {
  applyTelegramTheme();
  initPillsEmptyState();
  syncPillsFromStorage();
  initCalendar();
  renderCalendar();
  initActions();
  applyUserName();
  scheduleMidnightRefresh();
  initStorageSync();

  // Initialize header for all pages
  initHeader();

  window.__mymetricaMainReady = true;
}

main();
