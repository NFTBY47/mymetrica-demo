const STORAGE_KEY = 'mymetrica:medcard:v1';

function $(sel, root = document) {
  return root.querySelector(sel);
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1600);
}

function setupTelegram() {
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

  tg.BackButton?.show?.();
  tg.BackButton?.onClick?.(() => {
    window.location.href = 'medcard.html';
  });

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
  } catch {
  }
}

function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function formatRuDayMonth(iso) {
  const dt = parseISO(iso);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(dt);
}

function formatRuFull(iso) {
  const dt = parseISO(iso);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dt);
}

function loadAnalyses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mockAnalyses() {
  return [
    {
      id: '1',
      title: 'Общий анализ крови',
      date: '2025-05-15',
      markers: [
        { name: 'Гемоглобин', value: '128', unit: 'г/л', ref: '120–160' },
        { name: 'Лейкоциты', value: '6.4', unit: '10^9/л', ref: '4.0–9.0' },
        { name: 'Тромбоциты', value: '240', unit: '10^9/л', ref: '150–400' },
      ],
    },
    {
      id: '2',
      title: 'Общий анализ крови',
      date: '2025-06-20',
      markers: [
        { name: 'Гемоглобин', value: '122', unit: 'г/л', ref: '120–160' },
        { name: 'Лейкоциты', value: '8.9', unit: '10^9/л', ref: '4.0–9.0' },
        { name: 'Тромбоциты', value: '255', unit: '10^9/л', ref: '150–400' },
      ],
    },
    {
      id: '3',
      title: 'Общий анализ крови',
      date: '2025-08-12',
      markers: [
        { name: 'Гемоглобин', value: '118', unit: 'г/л', ref: '120–160' },
        { name: 'Лейкоциты', value: '10.6', unit: '10^9/л', ref: '4.0–9.0' },
        { name: 'Тромбоциты', value: '268', unit: '10^9/л', ref: '150–400' },
      ],
    },
    {
      id: '4',
      title: 'Общий анализ крови',
      date: '2025-10-15',
      markers: [
        { name: 'Гемоглобин', value: '135', unit: 'г/л', ref: '120–160' },
        { name: 'Лейкоциты', value: '11.5', unit: '10^9/л', ref: '4.0–9.0' },
        { name: 'Тромбоциты', value: '250', unit: '10^9/л', ref: '150–400' },
      ],
    },
  ];
}

function normalizeMarkerValue(x) {
  const s = String(x ?? '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normKey(name, unit) {
  const n = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const u = String(unit || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return '';
  return `${n}__${u}`;
}

function buildMarkerMap(analyses) {
  const map = new Map();

  (analyses || [])
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .forEach((a) => {
      const iso = String(a?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;

      const markers = Array.isArray(a.markers) ? a.markers : [];
      markers.forEach((m) => {
        const name = String(m?.name || '').trim();
        const unit = String(m?.unit || '').trim();
        const key = normKey(name, unit);
        if (!key) return;

        const value = normalizeMarkerValue(m?.value);
        if (value === null) return;

        const cur = map.get(key) || {
          key,
          name,
          unit,
          refs: new Set(),
          points: [],
        };

        const ref = String(m?.ref || '').trim();
        if (ref) cur.refs.add(ref);

        cur.points.push({ iso, value });
        map.set(key, cur);
      });
    });

  return map;
}

function computeTrend(points) {
  if (!points || points.length < 2) return { type: 'flat', delta: 0 };
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = last - first;
  const abs = Math.abs(delta);

  if (abs < 0.00001) return { type: 'flat', delta };
  return { type: delta > 0 ? 'up' : 'down', delta };
}

function renderChartSvg({ points, unit }) {
  if (!points || points.length === 0) {
    return '<div class="dyn-empty">Нет данных по этому маркеру</div>';
  }

  const w = 320;
  const h = 160;
  const padX = 18;
  const padY = 18;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const xStep = points.length === 1 ? 0 : innerW / (points.length - 1);

  const px = (i) => padX + i * xStep;
  const py = (v) => {
    const t = (v - min) / (max - min);
    return padY + (1 - t) * innerH;
  };

  const grid = [0.25, 0.5, 0.75]
    .map((t) => {
      const y = padY + (1 - t) * innerH;
      return `<line class="dyn-grid" x1="${padX}" y1="${y.toFixed(2)}" x2="${(padX + innerW).toFixed(2)}" y2="${y.toFixed(2)}" />`;
    })
    .join('');

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(p.value).toFixed(2)}`)
    .join(' ');

  const dots = points
    .map((p, i) => {
      const cx = px(i);
      const cy = py(p.value);
      const label = `${formatRuDayMonth(p.iso)}: ${p.value}${unit ? ` ${unit}` : ''}`;
      return `<circle class="dyn-dot" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4" data-label="${label.replace(/"/g, '&quot;')}" />`;
    })
    .join('');

  return `
    <svg class="dyn-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="График">
      ${grid}
      <path class="dyn-line" d="${d}" />
      ${dots}
    </svg>
  `.trim();
}

function buildInsight({ markerName, unit, points, refs }) {
  const trend = computeTrend(points);
  const last = points[points.length - 1];

  const absDelta = Math.abs(trend.delta);
  const trendText = trend.type === 'up' ? 'растёт' : trend.type === 'down' ? 'снижается' : 'стабилен';

  const lastLine = last
    ? `Последнее: ${last.value}${unit ? ` ${unit}` : ''} (${formatRuFull(last.iso)}).`
    : '';

  const refArr = Array.isArray(refs) ? refs.filter(Boolean) : [];
  const refLine = refArr.length > 0 ? `Референсы (как в бланке): ${refArr.slice(0, 2).join(' / ')}.` : '';

  let trendLine = `Тренд: ${trendText}.`;
  if (absDelta > 0.00001) {
    trendLine = `Тренд: ${trendText} (Δ ${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(2)}).`;
  }

  const guidance =
    'Если вы видите устойчивое изменение и оно совпадает с самочувствием — можно обсудить результаты с врачом и приложить динамику из приложения.';

  const note =
    'Подсказка носит информационный характер и не заменяет консультацию специалиста.';

  return [lastLine, refLine, trendLine, guidance, note].filter(Boolean).join('\n');
}

function renderList(markerSeries) {
  const listEl = $('#dynList');
  const emptyEl = $('#dynEmpty');
  if (!listEl || !emptyEl) return;

  if (!markerSeries || markerSeries.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  listEl.innerHTML = markerSeries
    .map((s) => {
      const firstISO = s.points[0].iso;
      const lastISO = s.points[s.points.length - 1].iso;
      const legend = `${formatRuDayMonth(firstISO)} — ${formatRuDayMonth(lastISO)} · ${s.points.length} измер.`;
      const chart = renderChartSvg({ points: s.points, unit: s.unit });
      const insight = buildInsight({ markerName: s.name, unit: s.unit, points: s.points, refs: s.refs });

      const insightHtml = insight
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      return `
        <section class="glass-card dyn-card" data-key="${s.key}" aria-label="График ${s.name}">
          <div class="dyn-card__head">
            <div class="dyn-card__title">${s.name}</div>
            <div class="dyn-card__unit">${s.unit || ''}</div>
          </div>
          <div class="dyn-chart">${chart}</div>
          <div class="dyn-legend">${legend}</div>
          <div class="dyn-insight">${insightHtml}</div>
        </section>
      `.trim();
    })
    .join('');
}

function initBack() {
  const btn = $('#backBtn');
  btn?.addEventListener('click', () => {
    window.location.href = 'medcard.html';
  });
}

function initDotToasts() {
  const listEl = $('#dynList');
  if (!listEl) return;

  listEl.addEventListener('click', (e) => {
    const c = e.target?.closest?.('.dyn-dot');
    if (!c) return;
    const label = c.getAttribute('data-label');
    if (label) toast(label);
    Telegram.WebApp?.HapticFeedback?.selectionChanged?.();
  });
}

function main() {
  setupTelegram();
  initBack();

  let analyses = loadAnalyses();
  if (!analyses || analyses.length === 0) analyses = mockAnalyses();

  const markerMap = buildMarkerMap(analyses);
  const markerSeries = Array.from(markerMap.values())
    .map((s) => ({
      ...s,
      refs: Array.from(s.refs.values()),
      points: (s.points || []).slice().sort((a, b) => String(a.iso).localeCompare(String(b.iso))),
    }))
    .filter((s) => Array.isArray(s.points) && s.points.length >= 2)
    .sort((a, b) => {
      const an = String(a.name || '').localeCompare(String(b.name || ''));
      if (an !== 0) return an;
      return String(a.unit || '').localeCompare(String(b.unit || ''));
    });

  initDotToasts();
  renderList(markerSeries);
}

main();
