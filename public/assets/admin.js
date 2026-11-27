// Organizer dashboard: central state, action lifecycle, cached/coalesced reads.
import {
  bindAction,
  createStore,
  debounce,
  delegateAction,
  escapeHtml,
  fetchJson,
  formatEgyptDate,
  invalidateRequests,
  setDialog,
  setElementStatus,
  syncModalScroll,
  toast,
} from './tkt-runtime.js';

const THEME_COLORS = {
  'royal-gold': ['#12151c', '#e9c46a'],
  'rose-blush': ['#2a1620', '#e8a5ac'],
  'lilac-dream': ['#1b1730', '#b8a5e8'],
  'emerald-wild': ['#10251d', '#7fd1a3'],
  'midnight-sky': ['#0d1b2a', '#7db8e8'],
};

const THEME_LABELS = {
  'royal-gold': 'ذهبي ملكي',
  'rose-blush': 'وردي',
  'lilac-dream': 'ليلكي',
  'emerald-wild': 'زمردي',
  'midnight-sky': 'ليلي',
};

const BADGES = {
  approval: {
    APPROVED: { label: 'موافق عليه', cls: 'badge badge--success' },
    PENDING: { label: 'قيد الانتظار', cls: 'badge badge--warning' },
    REJECTED: { label: 'مرفوض', cls: 'badge badge--danger' },
    NONE: { label: 'بدون', cls: 'badge badge--muted' },
  },
  pass: {
    NOT_ISSUED: { label: 'لم يُصدر', cls: 'badge badge--muted' },
    ISSUED: { label: 'مُصدر', cls: 'badge badge--info' },
    DELIVERED: { label: 'مُرسل', cls: 'badge badge--success' },
    FAILED: { label: 'فشل', cls: 'badge badge--danger' },
    REVOKED: { label: 'ملغي', cls: 'badge badge--muted' },
  },
  payment: {
    NOT_REQUIRED: { label: 'لا يتطلب', cls: 'badge badge--muted' },
    CONFIRMED: { label: 'مؤكد', cls: 'badge badge--success' },
    PENDING: { label: 'قيد المراجعة', cls: 'badge badge--warning' },
    FAILED: { label: 'فشل', cls: 'badge badge--danger' },
  },
};

const STATUS_LABELS = {
  DRAFT: 'مسودة',
  PLANNING: 'تخطيط',
  READY: 'جاهزة',
  PUBLISHED: 'منشورة',
  LIVE: 'مباشرة',
  COMPLETED: 'منتهية',
  ARCHIVED: 'أرشيف',
};

const $ = (id) => document.getElementById(id);
const el = {
  loginView: $('loginView'),
  appView: $('appView'),
  loginForm: $('loginForm'),
  loginBtn: $('loginBtn'),
  loginSpinner: $('loginSpinner'),
  loginError: $('loginError'),
  passwordInput: $('passwordInput'),
  logoutBtn: $('logoutBtn'),
  logoutSpinner: $('logoutSpinner'),
  authBadge: $('authBadge'),
  globalError: $('globalError'),
  globalErrorText: $('globalErrorText'),
  retryBtn: $('retryBtn'),
  retrySpinner: $('retrySpinner'),
  orgSelect: $('orgSelect'),
  folderSelect: $('folderSelect'),
  eventFilter: $('eventFilter'),
  folderTitle: $('folderTitle'),
  eventCount: $('eventCount'),
  eventList: $('eventList'),
  eventPanel: $('eventPanel'),
  eventTitle: $('eventTitle'),
  eventMeta: $('eventMeta'),
  designBtn: $('designBtn'),
  sendRemainingBtn: $('sendRemainingBtn'),
  sendSpinner: $('sendSpinner'),
  statsGrid: $('statsGrid'),
  breakdownGrid: $('breakdownGrid'),
  ticketCount: $('ticketCount'),
  ticketSearch: $('ticketSearch'),
  approvalFilter: $('approvalFilter'),
  passFilter: $('passFilter'),
  refreshBtn: $('refreshBtn'),
  refreshSpinner: $('refreshSpinner'),
  selectionBar: $('selectionBar'),
  selectionText: $('selectionText'),
  selectAll: $('selectAll'),
  clearSelectionBtn: $('clearSelectionBtn'),
  sendSelectedBtn: $('sendSelectedBtn'),
  sendSelectedSpinner: $('sendSelectedSpinner'),
  tableSpinner: $('tableSpinner'),
  ticketsBody: $('ticketsBody'),
  ticketCards: $('ticketCards'),
  emptyState: $('emptyState'),
  loadingState: $('loadingState'),
  designModal: $('designModal'),
  themeSwatches: $('themeSwatches'),
  designHeader: $('designHeader'),
  designAccent: $('designAccent'),
  designQuote: $('designQuote'),
  resetTickets: $('resetTickets'),
  designError: $('designError'),
  saveDesignBtn: $('saveDesignBtn'),
  designSpinner: $('designSpinner'),
  resetDesignBtn: $('resetDesignBtn'),
  toastHost: $('toastHost'),
};

const store = createStore({
  auth: { actor: null, ready: false },
  explorer: { organizations: [] },
  orgId: null,
  folderKey: '',
  folderId: null,
  eventFilter: 'upcoming',
  eventId: null,
  query: { approval: 'ALL', passStatus: 'ALL', q: '' },
  analytics: null,
  tickets: [],
  selected: new Set(),
  design: null,
  loading: { explorer: false, event: false },
  error: null,
});

let searchTimer = null;
let searchController = null;
let requestVersion = 0;

function currentOrg(state = store.get()) {
  return (state.explorer.organizations || []).find((item) => item.id === state.orgId) || null;
}

function setLoading(patch) {
  const loading = store.get().loading;
  store.set({ loading: { ...loading, ...patch } });
}

function showError(message) {
  store.set({ error: message || 'تعذّر تحميل البيانات.' });
}

function clearError() {
  if (store.get().error) store.set({ error: null });
}

function badge(value, map) {
  const entry = map[value] || { label: value || '—', cls: 'badge badge--muted' };
  return `<span class="${entry.cls}">${escapeHtml(entry.label)}</span>`;
}

function isPast(event) {
  if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') return true;
  if (event.endAt && new Date(event.endAt).getTime() < Date.now()) return true;
  return false;
}

function filteredEvents() {
  const state = store.get();
  const current = currentOrg(state);
  if (!current) return [];
  const inFolder = (current.events || []).filter((event) => {
    if (state.folderKey === '__none__') return !event.folderId;
    if (state.folderKey) return event.folderId === state.folderKey;
    return true;
  });
  let list = inFolder;
  if (state.eventFilter === 'upcoming') list = inFolder.filter((event) => !isPast(event));
  if (state.eventFilter === 'past') list = inFolder.filter((event) => isPast(event));
  return [...list].sort((a, b) => {
    const at = new Date(a.startAt || 0).getTime();
    const bt = new Date(b.startAt || 0).getTime();
    return state.eventFilter === 'past' ? bt - at : at - bt;
  });
}

function defaultFolderPatch() {
  const state = store.get();
  const current = currentOrg(state);
  if (!current) return state.folderKey || state.folderId ? { folderKey: '', folderId: null } : null;
  const keys = (current.folders || []).map((folder) => folder.id);
  if ((current.events || []).some((event) => !event.folderId)) keys.push('__none__');
  if (state.folderKey && keys.includes(state.folderKey)) return null;
  const folderKey = keys[0] || '';
  const folderId = folderKey === '__none__' || !folderKey ? null : folderKey;
  if (state.folderKey === folderKey && state.folderId === folderId) return null;
  return { folderKey, folderId };
}

function renderAuth() {
  const { auth } = store.get();
  const loggedIn = Boolean(auth.actor);
  el.loginView.hidden = loggedIn;
  el.appView.hidden = !loggedIn;
  if (!loggedIn) return;
  const actor = auth.actor;
  const label = actor.name || actor.email || (actor.master ? 'Master admin' : 'TKT user');
  el.authBadge.textContent = `${label}${actor.master ? ' · master' : ''}`;
}

function renderError() {
  const { error } = store.get();
  el.globalError.hidden = !error;
  el.globalErrorText.textContent = error || '';
}

function renderExplorer() {
  const state = store.get();
  const orgs = state.explorer.organizations || [];
  const orgPatch = orgs.length && !orgs.some((item) => item.id === state.orgId) ? { orgId: orgs[0].id } : null;
  if (orgPatch) {
    store.set({ ...orgPatch, folderKey: '', folderId: null, eventId: null });
    return;
  }
  el.orgSelect.innerHTML = orgs.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('') || '<option value="">—</option>';
  if (state.orgId) el.orgSelect.value = state.orgId;
  renderFolders();
}

function renderFolders() {
  const patch = defaultFolderPatch();
  if (patch) {
    store.set(patch);
    renderFolders();
    return;
  }
  const state = store.get();
  const current = currentOrg(state);
  const folders = current?.folders || [];
  const hasUnfiled = (current?.events || []).some((event) => !event.folderId);
  const options = folders.map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`);
  if (hasUnfiled) options.push('<option value="__none__">بدون مجلد · No folder</option>');
  el.folderSelect.innerHTML = options.join('') || '<option value="">لا توجد مجلدات</option>';
  if (state.folderKey) el.folderSelect.value = state.folderKey;
  renderEvents();
}

function renderEvents() {
  const state = store.get();
  el.eventFilter.querySelectorAll('.filter-btn').forEach((button) => {
    const active = button.dataset.filter === state.eventFilter;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const current = currentOrg(state);
  const folder = (current?.folders || []).find((item) => item.id === state.folderId);
  el.folderTitle.textContent = folder?.name || 'بدون مجلد · No folder';
  const events = filteredEvents();
  el.eventCount.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

  if (!events.length) {
    el.eventList.innerHTML = '<p class="small muted" style="grid-column:1/-1;margin:0">لا توجد فعاليات في هذا العرض.</p>';
  } else {
    el.eventList.innerHTML = events.map((event) => {
      const active = event.id === state.eventId;
      const date = formatEgyptDate(event.startAt, { day: 'numeric', month: 'short', year: 'numeric' });
      const statusClass = event.status === 'LIVE'
        ? 'status-pill status-pill--live'
        : event.status === 'PUBLISHED'
          ? 'status-pill status-pill--published'
          : 'status-pill';
      const count = Number(event.ticketCount || 0);
      return `<button type="button" class="event-card" data-event-id="${escapeHtml(event.id)}" aria-pressed="${active ? 'true' : 'false'}">
                <div class="event-card__top">
                  <p class="event-card__title">${escapeHtml(event.name)}</p>
                  <span class="${statusClass}">${escapeHtml(STATUS_LABELS[event.status] || event.status || '—')}</span>
                </div>
                <div class="event-card__meta">
                  <span class="display">◷ ${escapeHtml(date)}</span>
                  <span>▣ ${count} ticket${count === 1 ? '' : 's'}</span>
                </div>
              </button>`;
    }).join('');
  }

  if (state.eventId && !events.some((item) => item.id === state.eventId)) {
    store.set({ eventId: null, selected: new Set() });
  }
}

function renderEventPanel() {
  el.eventPanel.hidden = !store.get().eventId;
}

function statCard(label, sub, value, tone = '') {
  return `<div class="kpi ${tone}">
            <p class="kpi__label">${escapeHtml(label)}</p>
            <p class="kpi__sub">${escapeHtml(sub)}</p>
            <p class="kpi__value">${escapeHtml(value)}</p>
          </div>`;
}

function breakdownCard(title, entries) {
  const rows = entries.map(([label, value]) => `<div class="breakdown__row">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(value)}</span>
    </div>`).join('');
  return `<div class="breakdown">
            <p class="breakdown__title">${escapeHtml(title)}</p>${rows || '<p class="breakdown__empty">—</p>'}
          </div>`;
}

function renderAnalytics() {
  const data = store.get().analytics;
  if (!data) return;
  const stats = data.stats || {};
  const pass = stats.pass || {};
  const approval = stats.approval || {};
  el.eventTitle.textContent = data.event?.name || '—';
  const when = formatEgyptDate(data.event?.startAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  el.eventMeta.textContent = `${data.event?.org?.name || ''} · ${when} · ${data.event?.venueName || ''}`;

  el.statsGrid.innerHTML = [
    statCard('أشخاص', 'People', stats.people ?? 0),
    statCard('تذاكر', 'Tickets', stats.tickets ?? 0),
    statCard('جوازات مؤهلة', 'Eligible passes', stats.eligiblePasses ?? 0, 'kpi--accent'),
    statCard('مُرسَلة', 'Delivered', pass.DELIVERED ?? 0, 'kpi--gold'),
    statCard('مفتوحة', 'Opened', stats.opened ?? 0),
    statCard('مُخصّصة', 'Customized', stats.customized ?? 0),
  ].join('');

  const approvalEntries = Object.entries(approval).map(([key, value]) => [
    ({ APPROVED: 'موافق عليه', PENDING: 'قيد الانتظار', REJECTED: 'مرفوض', NONE: 'بدون' })[key] || key,
    value,
  ]);
  const passEntries = Object.entries(pass).map(([key, value]) => [
    ({ NOT_ISSUED: 'لم يُصدر', ISSUED: 'مُصدر', DELIVERED: 'مُرسل', FAILED: 'فشل', REVOKED: 'ملغي' })[key] || key,
    value,
  ]);
  el.breakdownGrid.innerHTML = [
    breakdownCard('حالات الموافقة · Approvals', approvalEntries),
    breakdownCard('حالات الجواز · Passes', passEntries),
  ].join('');
}

function renderTickets() {
  const state = store.get();
  const tickets = state.tickets || [];
  const eligibleCount = tickets.filter((ticket) => ticket.eligible).length;
  el.ticketCount.textContent = `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`;
  el.emptyState.hidden = tickets.length > 0 || state.loading.event;
  el.loadingState.hidden = !state.loading.event;
  el.selectAll.checked = eligibleCount > 0 && state.selected.size === eligibleCount;

  el.ticketsBody.innerHTML = tickets.map((ticket) => {
    const selected = state.selected.has(ticket.id);
    const eligibleAttr = ticket.eligible ? '' : 'disabled title="وافق على الحجز وأكّد الدفع أولاً"';
    return `<tr data-selected="${selected ? 'true' : 'false'}">
      <td><input type="checkbox" class="checkbox" data-select-id="${escapeHtml(ticket.id)}" ${selected ? 'checked' : ''} ${eligibleAttr} /></td>
      <td class="mono small">${escapeHtml(ticket.id)}</td>
      <td><span class="cell-strong">${escapeHtml(ticket.name || '—')}</span></td>
      <td class="ltr small muted" dir="ltr">${escapeHtml(ticket.email || '—')}</td>
      <td class="small">${escapeHtml(ticket.seat || '—')}</td>
      <td>${badge(ticket.approval, BADGES.approval)}</td>
      <td>${badge(ticket.payment, BADGES.payment)}</td>
      <td>${badge(ticket.passStatus, BADGES.pass)}${ticket.eligible ? '' : '<span class="ineligible-note">غير مؤهل</span>'}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-preview-id="${escapeHtml(ticket.id)}" ${eligibleAttr}>معاينة</button>
          <button type="button" class="btn btn-primary btn-sm" data-send-id="${escapeHtml(ticket.id)}" ${eligibleAttr}>إرسال</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.ticketCards.innerHTML = tickets.map((ticket) => {
    const selected = state.selected.has(ticket.id);
    const eligibleAttr = ticket.eligible ? '' : 'disabled';
    return `<div class="ticket-card" data-selected="${selected ? 'true' : 'false'}">
      <div class="ticket-card__head">
        <label class="ticket-card__id">
          <input type="checkbox" class="checkbox" data-select-id="${escapeHtml(ticket.id)}" ${selected ? 'checked' : ''} ${eligibleAttr} />
          <span>${escapeHtml(ticket.id)}</span>
        </label>
        ${badge(ticket.passStatus, BADGES.pass)}
      </div>
      <p class="ticket-card__name">${escapeHtml(ticket.name || '—')}</p>
      <p class="ticket-card__email ltr" dir="ltr">${escapeHtml(ticket.email || '—')}</p>
      <div class="ticket-card__meta">
        <span>المقعد: ${escapeHtml(ticket.seat || '—')}</span>
        ${badge(ticket.approval, BADGES.approval)}
        ${badge(ticket.payment, BADGES.payment)}
        ${ticket.eligible ? '' : '<span class="ineligible-note">غير مؤهل</span>'}
      </div>
      <div class="ticket-card__actions">
        <button type="button" class="btn btn-ghost btn-sm" data-preview-id="${escapeHtml(ticket.id)}" ${eligibleAttr}>معاينة</button>
        <button type="button" class="btn btn-primary btn-sm" data-send-id="${escapeHtml(ticket.id)}" ${eligibleAttr}>إرسال</button>
      </div>
    </div>`;
  }).join('');

  el.selectionBar.hidden = state.selected.size === 0;
  el.selectionText.textContent = `${state.selected.size} ticket${state.selected.size === 1 ? '' : 's'} selected`;
  el.tableSpinner.hidden = !state.loading.event;
}

function renderDesignForm() {
  const design = store.get().design || { theme: 'royal-gold', header: null, accent: null, quote: '' };
  const defaults = THEME_COLORS[design.theme] || THEME_COLORS['royal-gold'];
  el.designHeader.value = design.header || defaults[0];
  el.designAccent.value = design.accent || defaults[1];
  if (document.activeElement !== el.designQuote) el.designQuote.value = design.quote || '';
  el.themeSwatches.querySelectorAll('.theme-swatch').forEach((button) => {
    const active = button.dataset.theme === design.theme;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

store.subscribe((state, previous) => {
  if (state.auth !== previous.auth) renderAuth();
  if (state.error !== previous.error) renderError();
  if (state.explorer !== previous.explorer || state.orgId !== previous.orgId) renderExplorer();
  if (
    state.explorer !== previous.explorer ||
    state.orgId !== previous.orgId ||
    state.folderKey !== previous.folderKey ||
    state.folderId !== previous.folderId ||
    state.eventFilter !== previous.eventFilter ||
    state.eventId !== previous.eventId
  ) renderEvents();
  if (state.eventId !== previous.eventId) renderEventPanel();
  if (state.analytics !== previous.analytics) renderAnalytics();
  if (
    state.tickets !== previous.tickets ||
    state.selected !== previous.selected ||
    state.loading.event !== previous.loading.event
  ) renderTickets();
  if (state.design !== previous.design) renderDesignForm();
});

async function loadExplorer({ force = false } = {}) {
  setLoading({ explorer: true });
  try {
    clearError();
    const data = await fetchJson('/api/admin/explorer', { ttl: 20000, fresh: force });
    store.set({ explorer: data || { organizations: [] } });
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading({ explorer: false });
  }
}

async function loadEventData({ force = false, noCache = false, signal, version } = {}) {
  const state = store.get();
  if (!state.eventId) return;
  setLoading({ event: true });
  try {
    clearError();
    const params = new URLSearchParams({
      approval: state.query.approval,
      passStatus: state.query.passStatus,
    });
    if (state.query.q) params.set('q', state.query.q);
    const eventId = encodeURIComponent(state.eventId);
    const [analytics, ticketData] = await Promise.all([
      fetchJson(`/api/admin/analytics?eventId=${eventId}`, {
        ttl: force || noCache ? 0 : 12000,
        fresh: force || noCache,
        signal,
      }),
      fetchJson(`/api/admin/tickets?eventId=${eventId}&${params.toString()}`, {
        ttl: force || noCache ? 0 : 7000,
        fresh: force || noCache,
        signal,
      }),
    ]);
    if (version != null && version !== requestVersion) return;
    store.set({ analytics, tickets: ticketData.tickets || [] });
  } catch (error) {
    if (error.code === 'ABORTED') return;
    if (version != null && version !== requestVersion) return;
    showError(error.message);
  } finally {
    if (version == null || version === requestVersion) setLoading({ event: false });
  }
}

function refreshEventData({ force = false, noCache = false } = {}) {
  if (searchController) searchController.abort();
  searchController = new AbortController();
  const version = ++requestVersion;
  return loadEventData({ force, noCache, signal: searchController.signal, version });
}

async function selectEvent(eventId) {
  store.set({ eventId, selected: new Set() });
  await refreshEventData();
}

function updateQuery(patch) {
  const query = store.get().query;
  if (Object.entries(patch).every(([key, value]) => query[key] === value)) return;
  // Filtering changes the visible set; never keep hidden tickets selected.
  store.set({ query: { ...query, ...patch }, selected: new Set() });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('handoff') === 'error') {
    setElementStatus(el.loginError, 'انتهت صلاحية رابط TKT. سجّل الدخول من TKT مرة أخرى.', 'error');
  }
  try {
    const auth = await fetchJson('/api/admin/auth');
    store.set({ auth: { actor: auth.authenticated ? (auth.actor || { master: true, name: 'Master admin' }) : null, ready: true } });
    if (auth.authenticated) await loadExplorer();
  } catch {
    store.set({ auth: { actor: null, ready: true } });
  }
}

async function login(event) {
  event?.preventDefault?.();
  const password = el.passwordInput.value;
  await fetchJson('/api/admin/auth', { method: 'POST', body: { password } });
  el.passwordInput.value = '';
  setElementStatus(el.loginError, '', '');
  store.set({ auth: { actor: { master: true, name: 'Master admin' }, ready: true } });
  await loadExplorer({ force: true });
}

async function logout() {
  await fetchJson('/api/admin/logout', { method: 'POST', body: {} });
  location.reload();
}

function sendMessage(data) {
  toast(
    el.toastHost,
    data?.capReached
      ? `تم تجاوز الحد اليومي · ${data.queued ?? 0} queued`
      : `تمت إضافة ${data?.queued ?? 0} جواز إلى قائمة الإرسال`,
  );
}

async function sendTickets(ids) {
  const cleanIds = [...new Set(ids)].filter(Boolean);
  if (!cleanIds.length) {
    toast(el.toastHost, 'لا توجد تذاكر محددة للإرسال.', 'error');
    return undefined;
  }
  const data = await fetchJson('/api/admin/send', { method: 'POST', body: { ids: cleanIds } });
  sendMessage(data);
  store.set({ selected: new Set() });
  invalidateRequests('/api/admin');
  await refreshEventData({ force: true });
  return data;
}

async function sendRemaining() {
  const eventId = store.get().eventId;
  if (!eventId) return undefined;
  const data = await fetchJson('/api/admin/send', { method: 'POST', body: { eventId } });
  sendMessage(data);
  invalidateRequests('/api/admin');
  await refreshEventData({ force: true });
  return data;
}

async function previewTicket(ticketId) {
  const data = await fetchJson('/api/admin/preview', { method: 'POST', body: { ticketId } });
  window.open(data.url, '_blank', 'noopener');
  return data;
}

async function openDesign() {
  const eventId = store.get().eventId;
  if (!eventId) return;
  const data = await fetchJson(`/api/admin/design?eventId=${encodeURIComponent(eventId)}`, { ttl: 8000 });
  store.set({ design: data.design || { theme: 'royal-gold', header: null, accent: null, quote: '' } });
  setElementStatus(el.designError, '', '');
  setDialog(el.designModal, true);
}

function readDesign() {
  const design = store.get().design || {};
  return {
    theme: design.theme || 'royal-gold',
    header: el.designHeader.value,
    accent: el.designAccent.value,
    quote: el.designQuote.value,
  };
}

async function saveDesign(reset) {
  const eventId = store.get().eventId;
  if (!eventId) return;
  const body = reset
    ? { eventId }
    : { eventId, design: readDesign(), resetTickets: el.resetTickets.checked };
  await fetchJson('/api/admin/design', { method: reset ? 'POST' : 'PUT', body });
  invalidateRequests('/api/admin');
  setDialog(el.designModal, false);
  toast(el.toastHost, reset ? 'تمت إعادة التصميم الافتراضي' : 'تم حفظ التصميم');
  await refreshEventData({ force: true });
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  updateQuery({ q: el.ticketSearch.value.trim() });
  searchTimer = setTimeout(() => {
    if (store.get().eventId) refreshEventData({ noCache: true });
  }, 280);
}

// Action bindings.
bindAction(el.loginForm, login, {
  event: 'submit',
  disableElement: el.loginBtn,
  spinner: el.loginSpinner,
  statusEl: el.loginError,
  errorText: (error) => error.message,
  rethrow: false,
});
bindAction(el.logoutBtn, logout, { spinner: el.logoutSpinner, errorText: (error) => error.message, onError: (error) => toast(el.toastHost, error.message, 'error') });
bindAction(el.retryBtn, () => loadExplorer({ force: true }), { spinner: el.retrySpinner });
bindAction(el.refreshBtn, () => refreshEventData({ force: true }), { spinner: el.refreshSpinner });
bindAction(el.designBtn, openDesign, { errorText: (error) => error.message, onError: (error) => toast(el.toastHost, error.message, 'error') });
bindAction(el.sendRemainingBtn, sendRemaining, { spinner: el.sendSpinner, errorText: (error) => error.message, onError: (error) => toast(el.toastHost, error.message, 'error') });
bindAction(el.sendSelectedBtn, () => sendTickets([...store.get().selected]), {
  spinner: el.sendSelectedSpinner,
  errorText: (error) => error.message,
  onError: (error) => toast(el.toastHost, error.message, 'error'),
});
bindAction(el.saveDesignBtn, () => saveDesign(false), {
  spinner: el.designSpinner,
  statusEl: el.designError,
  errorText: (error) => error.message,
  onError: (error) => toast(el.toastHost, error.message, 'error'),
});
bindAction(el.resetDesignBtn, () => saveDesign(true), {
  spinner: el.designSpinner,
  statusEl: el.designError,
  errorText: (error) => error.message,
  onError: (error) => toast(el.toastHost, error.message, 'error'),
});

delegateAction(el.eventList, '[data-event-id]', (_event, button) => selectEvent(button.dataset.eventId));
delegateAction(document, '[data-preview-id]', (_event, button) => previewTicket(button.dataset.previewId), {
  errorText: (error) => (error.status === 409
    ? 'هذا الحجز غير مؤهل بعد — وافق عليه وأكّد الدفع أولاً'
    : error.message),
  onError: (error) => toast(el.toastHost, error.status === 409
    ? 'هذا الحجز غير مؤهل بعد — وافق عليه وأكّد الدفع أولاً'
    : error.message, 'error'),
});
delegateAction(document, '[data-send-id]', (_event, button) => sendTickets([button.dataset.sendId]), {
  errorText: (error) => error.message,
  onError: (error) => toast(el.toastHost, error.message, 'error'),
});

el.themeSwatches.innerHTML = Object.keys(THEME_LABELS).map((theme) => {
  const colors = THEME_COLORS[theme];
  return `<button type="button" class="theme-swatch" data-theme="${escapeHtml(theme)}" aria-pressed="false">
            <span class="swatch-dot" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})"></span>
            ${escapeHtml(THEME_LABELS[theme])}
          </button>`;
}).join('');

delegateAction(el.themeSwatches, '.theme-swatch', (_event, button) => {
  const design = store.get().design || {};
  store.set({ design: { ...design, theme: button.dataset.theme } });
});

el.orgSelect.addEventListener('change', (event) => {
  store.set({ orgId: event.target.value, folderKey: '', folderId: null, eventId: null, selected: new Set() });
});
el.folderSelect.addEventListener('change', (event) => {
  const folderKey = event.target.value;
  store.set({
    folderKey,
    folderId: folderKey === '__none__' || !folderKey ? null : folderKey,
    eventId: null,
    selected: new Set(),
  });
});
delegateAction(el.eventFilter, '.filter-btn', (_event, button) => {
  store.set({ eventFilter: button.dataset.filter });
});
el.approvalFilter.addEventListener('change', (event) => {
  updateQuery({ approval: event.target.value });
  if (store.get().eventId) refreshEventData();
});
el.passFilter.addEventListener('change', (event) => {
  updateQuery({ passStatus: event.target.value });
  if (store.get().eventId) refreshEventData();
});
el.ticketSearch.addEventListener('input', scheduleSearch);
el.selectAll.addEventListener('change', (event) => {
  const tickets = store.get().tickets;
  store.set({
    selected: new Set(event.target.checked ? tickets.filter((ticket) => ticket.eligible).map((ticket) => ticket.id) : []),
  });
});
el.clearSelectionBtn.addEventListener('click', () => store.set({ selected: new Set() }));
document.addEventListener('change', (event) => {
  const input = event.target instanceof Element ? event.target.closest('[data-select-id]') : null;
  if (!input) return;
  const selected = new Set(store.get().selected);
  if (input.checked) selected.add(input.dataset.selectId);
  else selected.delete(input.dataset.selectId);
  store.set({ selected });
});
document.querySelectorAll('[data-close-design]').forEach((button) => {
  button.addEventListener('click', () => setDialog(el.designModal, false));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.designModal.hidden) setDialog(el.designModal, false);
});

renderAuth();
renderError();
renderExplorer();
renderEventPanel();
renderDesignForm();
syncModalScroll();
boot();
