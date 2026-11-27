// Guest pass: central state, action lifecycle, request coalescing, lazy exports.
import {
  bindAction,
  createStore,
  debounce,
  delegateAction,
  downloadBlob,
  fetchJson,
  loadScript,
  nextFrame,
  setDialog,
  setElementStatus,
  syncModalScroll,
} from './tkt-runtime.js';

const QR_LIB = '/assets/qrcode.min.js';
const HTML2CANVAS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

const THEMES = {
  'royal-gold': { header: '#161411', accent: '#D4B475', accentDark: '#9E7B3B', accentLight: '#FFF2CC', body: '#F7F5F0', footer: '#EFECE4' },
  'rose-blush': { header: '#2D1824', accent: '#F4A9C7', accentDark: '#B84A78', accentLight: '#FFE4F0', body: '#FDF7FA', footer: '#F7EBF1' },
  'lilac-dream': { header: '#211936', accent: '#C8B2FF', accentDark: '#6D4AC4', accentLight: '#EFE8FF', body: '#F8F6FC', footer: '#EFEBF7' },
  'emerald-wild': { header: '#10261F', accent: '#6EE7B7', accentDark: '#1E7A58', accentLight: '#D1FAE5', body: '#F5FAF8', footer: '#E8F3EE' },
  'midnight-sky': { header: '#0F1E33', accent: '#7DD3FC', accentDark: '#1D6FA5', accentLight: '#E0F2FE', body: '#F5F9FC', footer: '#E8F1F8' },
};

const PREVIEW = {
  id: 'TKT-PASS',
  scanCode: '',
  name: 'Omar Khaled',
  seat: 'Bus 01 · Seat A4',
  event: 'Wadi Degla Escape',
  subtitle: 'مغامرة محمية وادي دجلة · An Extraordinary Day',
  dateTime: 'Friday, 4 December at 08:34 PM',
  startsAt: '2026-12-04T18:34:00.000Z',
  endsAt: null,
  location: 'Wadi Degla Protectorate · المعادي',
};

const $ = (id) => document.getElementById(id);
const el = {
  overlay: $('passOverlay'),
  overlaySpinner: $('overlaySpinner'),
  overlayIcon: $('overlayIcon'),
  overlayTitle: $('overlayTitle'),
  overlayMessage: $('overlayMessage'),
  overlayActionBtn: $('overlayActionBtn'),
  actionStatus: $('passActionStatus'),
  saveStatus: $('saveStatus'),
  passFlip: $('passFlip'),
  passFlipInner: $('passFlipInner'),
  passCard: $('passCard'),
  displayEventTitle: $('displayEventTitle'),
  displayEventSubtitle: $('displayEventSubtitle'),
  displayDateTime: $('displayDateTime'),
  displayHolderName: $('displayHolderName'),
  displayLocation: $('displayLocation'),
  displaySeat: $('displaySeat'),
  displayKeepsake: $('displayKeepsake'),
  keepsakeWrapper: $('keepsakeWrapper'),
  displayBackEvent: $('displayBackEvent'),
  displayScanCode: $('displayScanCode'),
  displayFooterCode: $('displayFooterCode'),
  qrBox: $('qrBox'),
  qrLarge: $('qrLarge'),
  mapsLink: $('mapsLinkBtn'),
  inputKeepsake: $('inputKeepsake'),
  colorHeader: $('colorHeader'),
  colorAccent: $('colorAccent'),
  themeSwatches: $('themeSwatches'),
  graphicSwatches: $('graphicSwatches'),
  passHeader: $('passHeader'),
  passBody: $('passBody'),
  modalHolderName: $('modalHolderName'),
  modalSeatInfo: $('modalSeatInfo'),
  modalTicketId: $('modalTicketId'),
  editModal: $('editModal'),
  qrModal: $('qrModal'),
  walletModal: $('walletModal'),
  walletPreviewImg: $('walletPreviewImg'),
  walletStatus: $('walletStatus'),
};

const params = new URLSearchParams(window.location.search);
const ticketToken = params.get('t') || '';
const isFilePreview = window.location.protocol === 'file:' && !ticketToken;

const store = createStore({
  load: { status: 'loading', code: null },
  data: { ...PREVIEW },
  design: { theme: 'royal-gold', custom: null, quote: 'أحلى لمة ومغامرة في وادي دجلة ✨' },
  save: { status: 'idle' },
  ui: {
    flipped: false,
    editOpen: false,
    qrOpen: false,
    walletOpen: false,
    walletState: 'idle',
  },
});

let lastQrPayload = '';
let walletBlob = null;
let walletPreviewUrl = null;
let walletFileName = 'TKT-Wallet-Pass.png';
let saveChain = Promise.resolve();

function normalizeHex(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value.toLowerCase() : fallback;
}

function mixColors(hexA, hexB, weightOfB) {
  const a = normalizeHex(hexA, '#000000');
  const b = normalizeHex(hexB, '#FFFFFF');
  const t = Math.max(0, Math.min(1, weightOfB));
  const channel = (i) => {
    const av = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
    const bv = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(av + (bv - av) * t).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function getPalette(themeKey, custom) {
  const base = THEMES[themeKey] || THEMES['royal-gold'];
  if (!custom) return base;
  const header = normalizeHex(custom.header, base.header);
  const accent = normalizeHex(custom.accent, base.accent);
  return {
    header,
    accent,
    accentDark: mixColors(accent, '#000000', 0.3),
    accentLight: mixColors(accent, '#FFFFFF', 0.8),
    body: mixColors('#FFFFFF', accent, 0.05),
    footer: mixColors('#FFFFFF', accent, 0.12),
  };
}

function ticketFromApi(data) {
  const ticket = data.ticket || {};
  return {
    id: ticket.id || PREVIEW.id,
    scanCode: ticket.scanCode || '',
    name: ticket.name || 'Guest',
    seat: ticket.seat || 'General Admission',
    event: ticket.eventTitle || PREVIEW.event,
    subtitle: ticket.eventSubtitle || PREVIEW.subtitle,
    dateTime: ticket.eventDate || PREVIEW.dateTime,
    startsAt: data.startsAt || PREVIEW.startsAt,
    endsAt: data.endsAt ?? null,
    location: ticket.location || PREVIEW.location,
  };
}

function designFromApi(data) {
  const design = data.design || {};
  const theme = THEMES[design.theme] ? design.theme : 'royal-gold';
  return {
    theme,
    custom: design.header && design.accent
      ? {
          header: normalizeHex(design.header, THEMES[theme].header),
          accent: normalizeHex(design.accent, THEMES[theme].accent),
        }
      : null,
    quote: design.quote || '',
    graphic: ['none', 'topographic', 'contours', 'grid', 'orbit', 'diagonal'].includes(design.graphic) ? design.graphic : 'none',
  };
}

function currentDesign() {
  const { theme, custom, quote, graphic } = store.get().design;
  return {
    theme,
    header: custom ? custom.header : null,
    accent: custom ? custom.accent : null,
    quote: quote || '',
    graphic: graphic || 'none',
  };
}

function buildQrSvg(text, pixelSize) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cellSize = Math.max(2, Math.floor(pixelSize / count));
  return qr.createSvgTag({ cellSize, margin: 0, scalable: true });
}

function renderQr() {
  if (typeof window.qrcode !== 'function') return;
  const data = store.get().data;
  const cleanId = (data.id || PREVIEW.id).trim();
  // Gate scanners validate signed credential codes. The reservation code is
  // displayed but never used as the entry payload.
  const payload = (data.scanCode || '').trim() || `TKT|${cleanId}|TKT|GA`;
  if (payload === lastQrPayload && el.qrBox.firstChild) return;
  lastQrPayload = payload;

  el.qrBox.innerHTML = buildQrSvg(payload, 112);
  const smallSvg = el.qrBox.querySelector('svg');
  if (smallSvg) {
    smallSvg.setAttribute('width', '112');
    smallSvg.setAttribute('height', '112');
  }

  el.qrLarge.innerHTML = buildQrSvg(payload, 210);
  const largeSvg = el.qrLarge.querySelector('svg');
  if (largeSvg) {
    largeSvg.setAttribute('width', '210');
    largeSvg.setAttribute('height', '210');
  }
}

async function ensureQrLibrary() {
  if (typeof window.qrcode === 'function') return;
  try {
    await loadScript(QR_LIB, { globalName: 'qrcode', id: 'tkt-qr-lib' });
    renderQr();
  } catch {
    setElementStatus(el.actionStatus, 'تعذّر تحميل رمز QR. تحقق من الاتصال.', 'error', 4500);
  }
}

async function ensureHtml2Canvas() {
  if (typeof window.html2canvas === 'function') return;
  await loadScript(HTML2CANVAS_LIB, { globalName: 'html2canvas', id: 'tkt-html2canvas-lib' });
}

function overlayCopy(code) {
  if (code === 'EXPIRED_LINK') {
    return { title: 'انتهت صلاحية الرابط', message: 'اطلب تذكرة جديدة من المنظّم.', icon: '⌛', retry: false };
  }
  if (code === 'NOT_FOUND') {
    return { title: 'التذكرة غير موجودة', message: 'تحقق من الرابط أو تواصل مع المنظّم.', icon: '🔍', retry: false };
  }
  if (code === 'INVALID_LINK') {
    return { title: 'رابط غير صالح', message: 'لم نتمكن من التحقق من رابط التذكرة.', icon: '🔒', retry: false };
  }
  return { title: 'تعذّر تحميل التذكرة', message: 'تأكد من الاتصال بالإنترنت وحاول مرة أخرى.', icon: '⚠️', retry: true };
}

function renderOverlay() {
  const { status, code } = store.get().load;
  if (status === 'ready') {
    el.overlay.classList.add('hidden');
    return;
  }
  el.overlay.classList.remove('hidden');
  if (status === 'loading') {
    el.overlaySpinner.classList.remove('hidden');
    el.overlayIcon.classList.add('hidden');
    el.overlayTitle.textContent = 'جاري تحميل تذكرتك...';
    el.overlayMessage.textContent = '';
    el.overlayActionBtn.classList.add('hidden');
    return;
  }
  const copy = overlayCopy(code);
  el.overlaySpinner.classList.add('hidden');
  el.overlayIcon.classList.remove('hidden');
  el.overlayIcon.textContent = copy.icon;
  el.overlayTitle.textContent = copy.title;
  el.overlayMessage.textContent = copy.message;
  el.overlayActionBtn.classList.toggle('hidden', !copy.retry);
}

function renderTicket() {
  const data = store.get().data;
  el.displayEventTitle.textContent = data.event;
  el.displayEventSubtitle.textContent = data.subtitle;
  el.displayDateTime.textContent = data.dateTime;
  el.displayHolderName.textContent = data.name || 'Guest';
  el.displayLocation.textContent = data.location;
  el.displaySeat.textContent = data.seat || 'General Admission';
  el.displayBackEvent.textContent = data.event;
  el.displayScanCode.textContent = data.scanCode || data.id;
  el.displayFooterCode.textContent = `${data.id} · SCAN AT ENTRY`;
  el.modalHolderName.textContent = data.name || 'Guest';
  el.modalSeatInfo.textContent = data.seat || 'General Admission';
  el.modalTicketId.textContent = data.id;

  if (el.mapsLink) {
    const query = encodeURIComponent(data.location || 'Wadi Degla Protectorate, Cairo, Egypt');
    el.mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  renderQr();
}

function renderDesign() {
  const { design } = store.get();
  const palette = getPalette(design.theme, design.custom);
  const root = document.documentElement;
  root.style.setProperty('--pass-header', palette.header);
  root.style.setProperty('--pass-accent', palette.accent);
  root.style.setProperty('--pass-accent-dark', palette.accentDark);
  root.style.setProperty('--pass-accent-light', palette.accentLight);
  root.style.setProperty('--pass-body', palette.body);
  root.style.setProperty('--pass-footer', palette.footer);

  if (el.colorHeader) el.colorHeader.value = palette.header;
  if (el.colorAccent) el.colorAccent.value = palette.accent;
  if (el.inputKeepsake && document.activeElement !== el.inputKeepsake) {
    el.inputKeepsake.value = design.quote || '';
  }
  const graphic = design.graphic || 'none';
  const graphicStyles = {
    topographic: { target: el.passHeader, pattern: 'radial-gradient(ellipse at 35% 55%, transparent 0 35px, color-mix(in srgb, var(--pass-accent) 35%, transparent) 36px 37px, transparent 38px 48px)', size: '100% 100%' },
    contours: { target: el.passBody, pattern: 'repeating-radial-gradient(ellipse at 75% 40%, transparent 0 13px, color-mix(in srgb, var(--pass-accent) 27%, transparent) 14px 15px, transparent 16px 24px)', size: '220px 180px' },
    grid: { target: el.passBody, pattern: 'linear-gradient(color-mix(in srgb, var(--pass-accent) 18%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--pass-accent) 18%, transparent) 1px, transparent 1px)', size: '18px 18px' },
    orbit: { target: el.passHeader, pattern: 'repeating-radial-gradient(ellipse at 88% 52%, transparent 0 18px, color-mix(in srgb, var(--pass-accent) 30%, transparent) 19px 20px, transparent 21px 31px)', size: '260px 220px' },
    diagonal: { target: el.passBody, pattern: 'repeating-linear-gradient(135deg, transparent 0 13px, color-mix(in srgb, var(--pass-accent) 24%, transparent) 14px 15px, transparent 16px 27px)', size: '180px 180px' },
  };
  [el.passHeader, el.passBody].forEach((node) => {
    if (node) { node.style.backgroundImage = ''; node.style.backgroundPosition = ''; node.style.backgroundSize = ''; }
  });
  const selectedGraphic = graphicStyles[graphic];
  if (selectedGraphic?.target) {
    selectedGraphic.target.style.backgroundImage = selectedGraphic.pattern;
    selectedGraphic.target.style.backgroundPosition = 'right center';
    selectedGraphic.target.style.backgroundSize = selectedGraphic.size;
    selectedGraphic.target.style.backgroundRepeat = 'no-repeat';
  }
  if (el.graphicSwatches) {
    el.graphicSwatches.querySelectorAll('.graphic-swatch').forEach((button) => {
      const selected = button.dataset.graphic === graphic;
      button.classList.toggle('border-2', selected);
      button.classList.toggle('border-[#161411]', selected);
      button.classList.toggle('border', !selected);
      button.classList.toggle('border-[#D4CBB8]', !selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  if (el.themeSwatches) {
    el.themeSwatches.querySelectorAll('.theme-swatch').forEach((button) => {
      const selected = !design.custom && button.dataset.theme === design.theme;
      button.classList.toggle('border-2', selected);
      button.classList.toggle('border-[#161411]', selected);
      button.classList.toggle('scale-105', selected);
      button.classList.toggle('border', !selected);
      button.classList.toggle('border-[#D4CBB8]', !selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  const quote = (design.quote || '').trim();
  el.keepsakeWrapper.classList.toggle('hidden', !quote);
  el.displayKeepsake.textContent = design.quote || '';
}

function renderFlip() {
  const flipped = store.get().ui.flipped;
  el.passFlip.classList.toggle('is-flipped', flipped);
  el.passFlip.setAttribute('aria-flipped', flipped ? 'true' : 'false');
  el.passFlip.setAttribute('aria-label', flipped ? 'Show pass front' : 'Show entry QR');
}

function renderDialogs() {
  const { ui } = store.get();
  setDialog(el.editModal, ui.editOpen);
  setDialog(el.qrModal, ui.qrOpen);
  setDialog(el.walletModal, ui.walletOpen);
}

function renderSaveStatus() {
  const status = store.get().save.status;
  const copy = {
    idle: ['', ''],
    saving: ['جاري الحفظ...', 'busy'],
    saved: ['تم الحفظ ✓', 'success'],
    error: ['تعذّر الحفظ', 'error'],
  }[status] || ['', ''];
  setElementStatus(el.saveStatus, copy[0], copy[1]);
}

function setWalletBlob(blob) {
  if (walletPreviewUrl) URL.revokeObjectURL(walletPreviewUrl);
  walletBlob = blob;
  walletPreviewUrl = blob ? URL.createObjectURL(blob) : null;
  el.walletPreviewImg.src = walletPreviewUrl || '';
}

function renderWallet() {
  const { walletOpen, walletState } = store.get().ui;
  if (!walletOpen) return;
  const copy = {
    idle: '',
    loading: 'جاري تجهيز بطاقة المحفظة...',
    ready: 'جاهزة! نزّل الصورة أو شاركها لحفظها في المحفظة.',
    error: 'تعذّر تجهيز البطاقة. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.',
  }[walletState];
  setElementStatus(el.walletStatus, copy, walletState === 'error' ? 'error' : walletState === 'ready' ? 'success' : 'busy');
  const downloadBtn = $('downloadWalletBtn');
  const shareBtn = $('shareWalletBtn');
  if (downloadBtn) downloadBtn.disabled = walletState !== 'ready';
  if (shareBtn) shareBtn.disabled = walletState !== 'ready';
}

function renderAll() {
  renderOverlay();
  renderTicket();
  renderDesign();
  renderFlip();
  renderDialogs();
  renderSaveStatus();
  renderWallet();
}

store.subscribe((state, previous) => {
  if (state.load !== previous.load) renderOverlay();
  if (state.data !== previous.data) renderTicket();
  if (state.design !== previous.design) renderDesign();
  if (state.ui.flipped !== previous.ui.flipped) renderFlip();
  if (
    state.ui.editOpen !== previous.ui.editOpen ||
    state.ui.qrOpen !== previous.ui.qrOpen ||
    state.ui.walletOpen !== previous.ui.walletOpen
  ) renderDialogs();
  if (state.save !== previous.save) renderSaveStatus();
  if (state.ui.walletState !== previous.ui.walletState || state.ui.walletOpen !== previous.ui.walletOpen) renderWallet();
});

async function loadPass({ force = false } = {}) {
  store.set({ load: { status: 'loading', code: null } });
  if (isFilePreview) {
    store.set({
      data: { ...PREVIEW },
      design: { theme: 'royal-gold', custom: null, quote: 'أحلى لمة ومغامرة في وادي دجلة ✨' },
      load: { status: 'ready', code: null },
    });
    return;
  }
  if (!ticketToken) {
    store.set({ load: { status: 'error', code: 'INVALID_LINK' } });
    return;
  }

  try {
    const data = await fetchJson(`/api/pass?t=${encodeURIComponent(ticketToken)}`, {
      ttl: 15000,
      fresh: force,
    });
    store.set({
      data: ticketFromApi(data),
      design: designFromApi(data),
      load: { status: 'ready', code: null },
    });
  } catch (error) {
    store.set({ load: { status: 'error', code: error.code || 'SERVER_ERROR' } });
  }
}

function updateDesign(patch, persist = true) {
  const design = store.get().design;
  store.set({ design: { ...design, ...patch } });
  if (persist) queueSave();
}

async function saveDesignNow() {
  if (!ticketToken || isFilePreview) return;
  store.set({ save: { status: 'saving' } });
  try {
    await fetchJson('/api/pass/design', {
      method: 'POST',
      body: { t: ticketToken, design: currentDesign() },
    });
    store.set({ save: { status: 'saved' } });
    setTimeout(() => {
      if (store.get().save.status === 'saved') store.set({ save: { status: 'idle' } });
    }, 2400);
  } catch {
    store.set({ save: { status: 'error' } });
  }
}

function queueSaveNow() {
  saveChain = saveChain.catch(() => {}).then(() => saveDesignNow());
  return saveChain;
}
const queueSave = debounce(queueSaveNow, 420);

function setFlipped(flipped, immediate = false) {
  const ui = store.get().ui;
  if (ui.flipped === flipped && !immediate) return Promise.resolve();
  store.set({ ui: { ...ui, flipped } });
  // QR is only needed once the guest turns to the entry face or zooms it.
  if (flipped) ensureQrLibrary();
  if (!immediate) return new Promise((resolve) => setTimeout(resolve, 380));
  el.passFlipInner.style.transition = 'none';
  void el.passFlipInner.offsetWidth;
  requestAnimationFrame(() => { el.passFlipInner.style.transition = ''; });
  return Promise.resolve();
}

function toggleFlip() {
  return setFlipped(!store.get().ui.flipped);
}

function openEdit() {
  store.set({ ui: { ...store.get().ui, editOpen: true } });
}

function closeEdit() {
  queueSave.flush();
  store.set({ ui: { ...store.get().ui, editOpen: false } });
}

function openQr() {
  store.set({ ui: { ...store.get().ui, qrOpen: true } });
  ensureQrLibrary();
}

function closeQr() {
  store.set({ ui: { ...store.get().ui, qrOpen: false } });
}

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function downloadIcs() {
  const data = store.get().data;
  const toIcsUtc = (value) => (value ? new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '');
  const startMs = data.startsAt ? new Date(data.startsAt).getTime() : Date.parse('2026-12-04T18:34:00Z');
  const dtStart = toIcsUtc(data.startsAt) || '20261204T183400Z';
  const dtEnd = toIcsUtc(data.endsAt) || toIcsUtc(new Date(startMs + 3 * 60 * 60 * 1000).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TKT//Event Pass//EN',
    'BEGIN:VEVENT',
    `UID:${icsEscape(data.id)}@ticketak.vercel.app`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(`TKT — ${data.event}`)}`,
    `DESCRIPTION:${icsEscape(`Pass Holder: ${data.name} | Seat: ${data.seat} | Ticket ID: ${data.id}`)}`,
    `LOCATION:${icsEscape(data.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  downloadBlob(new Blob([lines], { type: 'text/calendar;charset=utf-8' }), `${data.id || 'TKT-Pass'}.ics`);
}

async function prepareWallet() {
  store.set({ ui: { ...store.get().ui, walletOpen: true, walletState: 'loading' } });
  try {
    await ensureHtml2Canvas();
    await setFlipped(false, true);
    await nextFrame();
    const canvas = await window.html2canvas(el.passCard, {
      scale: 2,
      backgroundColor: '#E7E3D8',
      useCORS: true,
      logging: false,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG_EXPORT_FAILED');
    setWalletBlob(blob);
    walletFileName = `${(store.get().data.id || 'TKT-Pass').replace(/[^a-z0-9\-_]/gi, '-')}-wallet.png`;
    store.set({ ui: { ...store.get().ui, walletState: 'ready' } });
  } catch {
    store.set({ ui: { ...store.get().ui, walletState: 'error' } });
  }
}

async function shareWallet() {
  if (!walletBlob) return;
  const file = new File([walletBlob], walletFileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'TKT — Wallet Pass', text: 'تذكرتي لمغامرة وادي دجلة' });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  downloadBlob(walletBlob, walletFileName);
}

// Action bindings: every CTA gets disabled/busy handling and a status path.
bindAction(el.overlayActionBtn, () => loadPass({ force: true }), {});
bindAction($('flipCardBtn'), toggleFlip, {});
bindAction($('flipFrontBtn'), () => setFlipped(true), {});
bindAction($('flipBackBtn'), () => setFlipped(false), {});
bindAction($('toggleCustomizeBtn'), openEdit, {});
bindAction($('closeEditModalBtn'), closeEdit, {});
bindAction($('doneEditBtn'), closeEdit, {});
bindAction($('openQrModalBtn'), openQr, {});
bindAction($('closeQrModalBtn'), closeQr, {});
bindAction($('printPassBtn'), async () => {
  await setFlipped(false, true);
  await nextFrame();
  window.print();
}, { statusEl: el.actionStatus, successText: 'تم تجهيز التذكرة للطباعة', successTtl: 2400 });
bindAction($('downloadIcsBtn'), downloadIcs, {
  statusEl: el.actionStatus,
  successText: 'تم تنزيل موعد الفعالية',
  errorText: 'تعذّر إنشاء ملف التقويم',
});
bindAction($('saveWalletBtn'), prepareWallet, {});
bindAction($('closeWalletModalBtn'), () => {
  setWalletBlob(null);
  store.set({ ui: { ...store.get().ui, walletOpen: false, walletState: 'idle' } });
}, {});
bindAction($('downloadWalletBtn'), () => {
  if (!walletBlob) throw new Error('WALLET_NOT_READY');
  downloadBlob(walletBlob, walletFileName);
}, {
  statusEl: el.actionStatus,
  successText: 'تم تنزيل بطاقة المحفظة',
  errorText: 'جهّز البطاقة أولاً',
});
bindAction($('shareWalletBtn'), shareWallet, {
  statusEl: el.actionStatus,
  errorText: 'تعذّرت المشاركة. نزّل الصورة بدلاً من ذلك.',
});

delegateAction(el.themeSwatches, '.theme-swatch', (_event, button) => {
  updateDesign({ theme: button.dataset.theme, custom: null });
});

delegateAction(el.graphicSwatches, '.graphic-swatch', (_event, button) => {
  updateDesign({ graphic: button.dataset.graphic });
});

el.passFlip.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('button')) return;
  toggleFlip();
});
el.passFlip.addEventListener('keydown', (event) => {
  if (event.target !== el.passFlip) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleFlip();
  }
});
el.inputKeepsake.addEventListener('input', (event) => {
  updateDesign({ quote: event.target.value });
});
el.colorHeader.addEventListener('input', (event) => {
  const design = store.get().design;
  const palette = getPalette(design.theme, design.custom);
  updateDesign({ custom: { header: event.target.value, accent: palette.accent } });
});
el.colorAccent.addEventListener('input', (event) => {
  const design = store.get().design;
  const palette = getPalette(design.theme, design.custom);
  updateDesign({ custom: { header: palette.header, accent: event.target.value } });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const { ui } = store.get();
  if (ui.walletOpen) {
    setWalletBlob(null);
    store.set({ ui: { ...ui, walletOpen: false, walletState: 'idle' } });
  } else if (ui.qrOpen) closeQr();
  else if (ui.editOpen) closeEdit();
});
window.addEventListener('pagehide', () => queueSave.flush());

renderAll();
syncModalScroll();
loadPass();
