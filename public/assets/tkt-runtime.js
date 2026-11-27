// TKT-PASS shared client runtime.
// Tiny, dependency-free primitives used by both the guest pass and organizer app.

export const EGYPT_TIME_ZONE = 'Africa/Cairo';

const inflight = new Map();
const responseCache = new Map();
const scriptPromises = new Map();

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatEgyptDate(value, options = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: EGYPT_TIME_ZONE,
    hour12: true,
    hourCycle: 'h12',
  })
    .format(date)
    .replace(/\s?([ap]m)$/i, (_match, period) => ` ${period.toUpperCase()}`);
}

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    set(patch) {
      const nextPatch = typeof patch === 'function' ? patch(state) : patch;
      if (!nextPatch || typeof nextPatch !== 'object') return state;
      const previous = state;
      state = { ...state, ...nextPatch };
      listeners.forEach((listener) => listener(state, previous));
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function cacheKey(method, path, body) {
  const serializedBody = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return `${method.toUpperCase()} ${path} ${serializedBody}`;
}

function errorFromResponse(payload, status) {
  const error = new Error(
    payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
      `REQUEST_FAILED_${status}`,
  );
  error.status = status;
  error.code = typeof payload?.error === 'string' ? payload.error : payload?.error?.code || error.code;
  error.payload = payload;
  return error;
}

export function invalidateRequests(prefix = '') {
  for (const key of inflight.keys()) {
    if (!prefix || key.includes(prefix)) inflight.delete(key);
  }
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) responseCache.delete(key);
  }
}

export async function fetchJson(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'same-origin',
    signal,
    ttl = 0,
    fresh = false,
    forceNew = false,
    timeout = 15000,
  } = options;

  const normalizedMethod = method.toUpperCase();
  const key = cacheKey(normalizedMethod, path, body);
  const now = Date.now();
  const cached = responseCache.get(key);

  if (normalizedMethod === 'GET' && !fresh && cached && now - cached.at <= cached.ttl) {
    return structuredCloneSafe(cached.value);
  }

  // A caller-supplied signal means the caller owns cancellation, so do not
  // share that request with unrelated callers.
  const canShare = normalizedMethod === 'GET' && !signal && !forceNew;
  if (canShare && inflight.has(key)) return inflight.get(key);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeout);

  const cancel = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', cancel, { once: true });
  }

  const init = {
    method: normalizedMethod,
    credentials,
    headers: { ...headers },
    signal: controller.signal,
  };
  if (body != null) {
    if (typeof body === 'string' || body instanceof Blob || body instanceof FormData) {
      init.body = body;
      if (!init.headers['Content-Type'] && typeof body === 'string') {
        init.headers['Content-Type'] = 'application/json';
      }
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }

  const request = fetch(path, init)
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw errorFromResponse(payload, response.status);
      if (normalizedMethod === 'GET' && ttl > 0) {
        responseCache.set(key, { at: Date.now(), ttl, value: payload });
      }
      return payload;
    })
    .catch((error) => {
      if (timedOut) {
        error.code = 'TIMEOUT';
        error.message = 'الطلب استغرق وقتاً أطول من المتوقع. حاول مرة أخرى.';
      } else if (controller.signal.aborted && !signal?.aborted) {
        error.code = 'TIMEOUT';
      } else if (signal?.aborted) {
        error.code = 'ABORTED';
      }
      throw error;
    })
    .finally(() => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', cancel);
      if (canShare) inflight.delete(key);
    });

  if (canShare) inflight.set(key, request);
  return request;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function debounce(fn, wait) {
  let timer = null;
  let lastArgs = [];
  let lastThis = null;

  const debounced = function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(lastThis, lastArgs);
    }, wait);
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  debounced.flush = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
    fn.apply(lastThis, lastArgs);
  };
  return debounced;
}

export function setElementStatus(element, text, kind = 'info', ttl = 0) {
  if (!element) return;
  clearTimeout(element._tktStatusTimer);
  element.textContent = text || '';
  element.dataset.status = text ? kind : '';
  element.hidden = !text;
  if (text && ttl > 0) {
    element._tktStatusTimer = setTimeout(() => {
      element.textContent = '';
      element.dataset.status = '';
      element.hidden = true;
    }, ttl);
  }
}

export function toast(host, message, kind = 'ok', ttl = 4200) {
  if (!host) return;
  const node = document.createElement('div');
  node.className = `tkt-toast tkt-toast-${kind}`;
  node.textContent = message;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  host.appendChild(node);
  setTimeout(() => node.remove(), ttl);
}

function setBusy(element, on) {
  if (!element) return;
  element.disabled = on;
  element.setAttribute('aria-busy', on ? 'true' : 'false');
  element.classList.toggle('tkt-action-busy', on);
}

async function runWithActionState(element, handler, options = {}, event, source = element) {
  const {
    spinner,
    statusEl,
    busyText,
    successText,
    errorText,
    successTtl = 1800,
    errorTtl = 4500,
    onError,
    rethrow = false,
    disableElement = element,
  } = options;

  setBusy(disableElement, true);
  if (spinner) spinner.hidden = false;
  if (statusEl && busyText) setElementStatus(statusEl, busyText, 'busy');

  try {
    const result = await handler(event, source);
    if (statusEl && successText) {
      setElementStatus(statusEl, typeof successText === 'function' ? successText(result) : successText, 'success', successTtl);
    }
    return result;
  } catch (error) {
    const message = typeof errorText === 'function' ? errorText(error) : errorText;
    if (statusEl && message) setElementStatus(statusEl, message, 'error', errorTtl);
    if (typeof onError === 'function') onError(error, source);
    if (rethrow) throw error;
    return undefined;
  } finally {
    setBusy(disableElement, false);
    if (spinner) spinner.hidden = true;
  }
}

export function bindAction(element, handler, options = {}) {
  if (!element) return { run: async () => undefined, isRunning: () => false };
  let running = false;
  const eventName = options.event || 'click';

  const run = async (event) => {
    if (running && !options.allowConcurrent) {
      event?.preventDefault?.();
      return undefined;
    }
    running = true;
    try {
      return await runWithActionState(element, handler, options, event, element);
    } finally {
      running = false;
    }
  };

  element.addEventListener(eventName, run);
  return { run, isRunning: () => running };
}

export function delegateAction(root, selector, handler, options = {}) {
  if (!root) return;
  const running = new WeakSet();
  const eventName = options.event || 'click';

  root.addEventListener(eventName, async (event) => {
    const source = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!source || !root.contains(source) || source.disabled || running.has(source)) return;
    running.add(source);
    try {
      await runWithActionState(source, handler, options, event, source);
    } finally {
      running.delete(source);
    }
  });
}

export function loadScript(src, options = {}) {
  if (options.globalName && window[options.globalName]) return Promise.resolve(window[options.globalName]);
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (options.id) script.id = options.id;
    script.onload = () => resolve(window[options.globalName]);
    script.onerror = () => {
      script.remove();
      scriptPromises.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

export function downloadBlob(blob, fileName) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setDialog(dialog, open) {
  if (!dialog) return;
  if (open) dialog.removeAttribute('hidden');
  else dialog.setAttribute('hidden', '');
  dialog.classList.toggle('hidden', !open);
  dialog.classList.toggle('flex', open);
  syncModalScroll();
}

export function syncModalScroll() {
  const anyOpen = Boolean(document.querySelector('[data-dialog]:not(.hidden):not([hidden])'));
  document.body.classList.toggle('tkt-modal-open', anyOpen);
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
