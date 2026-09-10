const DEFAULTS = Object.freeze({
  isl: 2048,
  osl: 512,
  concurrency: 10,
  ttft: 500,
});

const HTMLElementBase = globalThis.HTMLElement ?? class {};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function seedValue(seed, primary, alias, fallback) {
  if (Object.hasOwn(seed, primary)) return seed[primary];
  if (alias && Object.hasOwn(seed, alias)) return seed[alias];
  return fallback;
}

function strictPositiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function validateSizingValues(values) {
  return ['isl', 'osl', 'concurrency', 'ttft'].filter(
    (field) => strictPositiveInteger(values[field]) === null,
  );
}

export function buildSizingRequest(config, values) {
  const model = config.models.find((item) => item.value === values.model);
  const gpu = config.gpus.find((item) => item.value === values.gpu);

  const isl = strictPositiveInteger(values.isl);
  const osl = strictPositiveInteger(values.osl);
  const ttft = strictPositiveInteger(values.ttft);
  const concurrency = strictPositiveInteger(values.concurrency);

  if (!model?.modelPath || !gpu?.system || [isl, osl, ttft, concurrency].includes(null)) return null;

  return {
    model_path: model.modelPath,
    system: gpu.system,
    isl,
    osl,
    ttft,
    target_concurrency: concurrency,
  };
}

export function normalizeSizingResponse(payload) {
  if (payload?.ok === false) return null;
  const isProxyWrapper = payload?.ok === true;
  const candidate = isProxyWrapper ? payload.data : payload;
  if (!candidate) return null;
  if (!isProxyWrapper && candidate.status !== 'completed') return null;
  if (isProxyWrapper && candidate.status !== undefined && candidate.status !== 'completed') return null;

  const tokensPerSecond = candidate.throughput?.tokensPerSecond;
  const ttftLatencyMs = candidate.performance?.ttftLatencyMs;
  const tpotMs = candidate.performance?.tpotMs;

  if (![tokensPerSecond, ttftLatencyMs, tpotMs].every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }

  return { tokensPerSecond, ttftLatencyMs, tpotMs };
}

function optionMarkup(items, selected) {
  return items.map((item) => (
    `<option value="${escapeHtml(item.value)}"${item.value === selected ? ' selected' : ''}>${escapeHtml(item.label || item.value)}</option>`
  )).join('');
}

function normalizeConfig(value) {
  const seed = value?.seed && typeof value.seed === 'object' ? value.seed : {};

  return {
    models: Array.isArray(value?.models)
      ? value.models.map((model) => ({
        value: model?.value ?? '',
        label: model?.label ?? '',
        modelPath: model?.modelPath ?? '',
      }))
      : [],
    gpus: Array.isArray(value?.gpus)
      ? value.gpus.map((gpu) => ({
        value: gpu?.value ?? '',
        label: gpu?.label ?? '',
        system: gpu?.system ?? '',
      }))
      : [],
    seed: {
      model: seed.model ?? null,
      modelId: seed.modelId ?? null,
      gpu: seed.gpu ?? null,
      gpuType: seed.gpuType ?? null,
      isl: seed.isl ?? null,
      islTokens: seed.islTokens ?? null,
      osl: seed.osl ?? null,
      oslTokens: seed.oslTokens ?? null,
      concurrency: seed.concurrency ?? null,
      ttft: seed.ttft ?? null,
      ttftMs: seed.ttftMs ?? null,
    },
  };
}

function configSignature(config) {
  return JSON.stringify(config);
}

const styles = `
  :host {
    --ciq-accent: var(--configiq-widget-accent, #0066cc);
    --ciq-accent-strong: var(--configiq-widget-accent-strong, #004b95);
    --ciq-accent-soft: var(--configiq-widget-accent-soft, #e7f1fa);
    --ciq-teal: var(--configiq-widget-secondary-accent, #007a87);
    --ciq-ink: var(--configiq-widget-text, #151515);
    --ciq-muted: var(--configiq-widget-text-muted, #3c3f42);
    --ciq-caption: var(--configiq-widget-text-caption, #54585c);
    --ciq-border: var(--configiq-widget-border, #d2d2d2);
    --ciq-surface: var(--configiq-widget-surface, #ffffff);
    --ciq-surface-subtle: var(--configiq-widget-surface-subtle, #f7f7f8);
    --ciq-control: var(--configiq-widget-control, #ffffff);
    --ciq-control-border: var(--configiq-widget-control-border, #8a8d90);
    --ciq-header: var(--configiq-widget-header, linear-gradient(115deg, #002f5d 0%, #005f73 100%));
    --ciq-header-text: var(--configiq-widget-header-text, #ffffff);
    --ciq-header-muted: var(--configiq-widget-header-muted, #eef7fb);
    --ciq-eyebrow: var(--configiq-widget-eyebrow, #c9e8ff);
    --ciq-chevron: var(--configiq-widget-chevron, #3c3f42);
    --ciq-error-surface: var(--configiq-widget-error-surface, #fff8e5);
    --ciq-error-text: var(--configiq-widget-error-text, #4f3800);
    --ciq-shadow: var(--configiq-widget-shadow, 0 8px 24px rgb(21 21 21 / 8%));
    --ciq-focus-ring: var(--configiq-widget-focus-ring, rgb(0 102 204 / 18%));
    color: var(--ciq-ink);
    display: block;
    font-family: "Red Hat Text", "Plus Jakarta Sans", system-ui, sans-serif;
    line-height: 1.5;
  }
  :host([theme="dark"]) {
    --ciq-accent: var(--configiq-widget-accent, #7c73ff);
    --ciq-accent-strong: var(--configiq-widget-accent-strong, #c4c0ff);
    --ciq-accent-soft: var(--configiq-widget-accent-soft, #292742);
    --ciq-teal: var(--configiq-widget-secondary-accent, #6bb8bd);
    --ciq-ink: var(--configiq-widget-text, #f5f5f5);
    --ciq-muted: var(--configiq-widget-text-muted, #d1d1d1);
    --ciq-caption: var(--configiq-widget-text-caption, #b8b8b8);
    --ciq-border: var(--configiq-widget-border, #484848);
    --ciq-surface: var(--configiq-widget-surface, #252525);
    --ciq-surface-subtle: var(--configiq-widget-surface-subtle, #202020);
    --ciq-control: var(--configiq-widget-control, #252525);
    --ciq-control-border: var(--configiq-widget-control-border, #484848);
    --ciq-header: var(--configiq-widget-header, #252525);
    --ciq-header-text: var(--configiq-widget-header-text, #f5f5f5);
    --ciq-header-muted: var(--configiq-widget-header-muted, #d1d1d1);
    --ciq-eyebrow: var(--configiq-widget-eyebrow, #d1d1d1);
    --ciq-chevron: var(--configiq-widget-chevron, #b8b8b8);
    --ciq-error-surface: var(--configiq-widget-error-surface, #3a321f);
    --ciq-error-text: var(--configiq-widget-error-text, #ffe8a3);
    --ciq-shadow: var(--configiq-widget-shadow, none);
  }
  * { box-sizing: border-box; }
  .shell {
    background: var(--ciq-surface);
    border: 1px solid var(--ciq-border);
    border-radius: 6px;
    box-shadow: var(--ciq-shadow);
    overflow: hidden;
  }
  .header {
    background: var(--ciq-header);
    color: var(--ciq-header-text);
    display: grid;
    gap: 6px;
    grid-template-areas:
      "eyebrow link"
      "title link"
      "intro link";
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 20px;
  }
  .header-top { display: contents; }
  .eyebrow {
    color: var(--ciq-eyebrow);
    font-family: "Red Hat Mono", "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .07em;
    text-transform: uppercase;
    grid-area: eyebrow;
  }
  .full-link {
    border: 1px solid currentColor;
    border-radius: 6px;
    color: var(--ciq-header-text);
    font-size: 12.5px;
    font-weight: 600;
    padding: 6px 10px;
    text-decoration: none;
    white-space: nowrap;
  }
  .full-link-slot:empty { display: none; }
  .full-link-slot { align-self: start; grid-area: link; margin-left: 12px; }
  .full-link:hover { background: rgb(255 255 255 / 10%); }
  .full-link:focus-visible { outline: 3px solid var(--ciq-accent); outline-offset: 2px; }
  .title { font-size: 22px; font-weight: 600; grid-area: title; line-height: 1.2; margin: 0; }
  .intro { color: var(--ciq-header-muted); font-size: 14px; grid-area: intro; margin: 0; max-width: 72ch; }
  .content { display: grid; gap: 20px; padding: 20px; }
  .inputs { display: grid; gap: 16px; grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .field { display: grid; gap: 6px; grid-column: span 3; }
  .field.wide { grid-column: span 6; }
  label { color: var(--ciq-ink); font-size: 13px; font-weight: 600; }
  input, select {
    appearance: none;
    background: var(--ciq-control);
    border: 1px solid var(--ciq-control-border);
    border-radius: 6px;
    color: var(--ciq-ink);
    font: inherit;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    min-height: 42px;
    padding: 9px 11px;
    width: 100%;
  }
  select {
    background-image: linear-gradient(45deg, transparent 50%, var(--ciq-chevron) 50%), linear-gradient(135deg, var(--ciq-chevron) 50%, transparent 50%);
    background-position: calc(100% - 16px) 18px, calc(100% - 11px) 18px;
    background-repeat: no-repeat;
    background-size: 5px 5px, 5px 5px;
    padding-right: 32px;
  }
  input:focus, select:focus { border-color: var(--ciq-accent); box-shadow: 0 0 0 3px var(--ciq-focus-ring); outline: 0; }
  .hint { color: var(--ciq-caption); font-size: 11.5px; line-height: 1.35; }
  .results { border-top: 1px solid var(--ciq-border); padding-top: 20px; }
  .status {
    background: var(--ciq-surface-subtle);
    border-left: 4px solid var(--ciq-accent);
    color: var(--ciq-muted);
    font-size: 14px;
    margin: 0;
    padding: 14px 16px;
  }
  .status.error { background: var(--ciq-error-surface); border-color: #f0ab00; color: var(--ciq-error-text); }
  .stats { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat {
    background: var(--ciq-surface-subtle);
    border: 1px solid var(--ciq-border);
    border-top: 3px solid var(--ciq-teal);
    border-radius: 6px;
    display: grid;
    gap: 4px;
    padding: 16px;
  }
  .stat.primary { background: var(--ciq-accent-soft); border-color: var(--ciq-accent); border-top-color: var(--ciq-accent); }
  .value {
    color: var(--ciq-ink);
    font-family: "Red Hat Display", "Plus Jakarta Sans", sans-serif;
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1.1;
  }
  .unit { color: var(--ciq-muted); font-family: "Red Hat Text", sans-serif; font-size: 13px; font-weight: 500; margin-left: 5px; white-space: nowrap; }
  .metric { color: var(--ciq-muted); font-size: 12.5px; font-weight: 600; }
  @media (max-width: 720px) {
    .header, .content { padding: 18px; }
    .header {
      grid-template-areas:
        "eyebrow"
        "title"
        "intro"
        "link";
      grid-template-columns: minmax(0, 1fr);
    }
    .full-link-slot { margin: 8px 0 0; }
    .inputs { grid-template-columns: 1fr; }
    .field, .field.wide { grid-column: auto; }
    .stats { grid-template-columns: 1fr; }
  }
`;

function fieldMarkup({ id, field, label, hint, value, max = 1000000 }) {
  const hintId = `${id}-hint`;
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <input id="${escapeHtml(id)}" data-field="${escapeHtml(field)}" type="number" min="1" max="${escapeHtml(max)}" step="1" value="${escapeHtml(value)}" required aria-required="true" aria-describedby="${escapeHtml(hintId)}">
      <span class="hint" id="${escapeHtml(hintId)}">${escapeHtml(hint)}</span>
    </div>`;
}

export class ConfigIqSizingWidget extends HTMLElementBase {
  #config = { models: [], gpus: [], seed: {} };
  #requestToken = 0;
  #timer = null;
  #controller = null;
  #configSignature = '';

  constructor() {
    super();
    if (this.attachShadow) this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() { return ['full-url', 'full-label', 'heading-level']; }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'heading-level') this.renderHeadingLevel();
    else this.renderFullLink();
  }

  set config(value) {
    const nextConfig = normalizeConfig(value);
    const nextSignature = configSignature(nextConfig);
    if (nextSignature === this.#configSignature) return;
    this.#config = nextConfig;
    this.#configSignature = nextSignature;
    if (this.isConnected) this.render();
  }

  get config() { return this.#config; }

  headingLevel() {
    const level = Number(this.getAttribute('heading-level') || 2);
    return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
  }

  connectedCallback() { this.render(); }

  disconnectedCallback() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#controller?.abort();
    this.#timer = null;
    this.#controller = null;
  }

  render() {
    if (!this.shadowRoot) return;
    const seed = this.#config.seed;
    const selectedModel = seed.model ?? seed.modelId ?? '';
    const selectedGpu = seed.gpu ?? seed.gpuType ?? '';
    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <section class="shell" aria-label="ConfigIQ performance sizing">
        <header class="header">
          <div class="header-top">
            <span class="eyebrow">ConfigIQ</span>
            <span class="full-link-slot">${this.fullLinkMarkup()}</span>
          </div>
          <div class="title" role="heading" aria-level="${this.headingLevel()}">Performance sizing</div>
          <p class="intro">Adjust an input to refresh throughput and latency.</p>
        </header>
        <div class="content">
          <div class="inputs" role="group" aria-label="Sizing inputs">
            <div class="field wide">
              <label for="model">Model</label>
              <select id="model" data-field="model" required aria-required="true">
                <option value="">Select a model…</option>
                ${optionMarkup(this.#config.models, selectedModel)}
              </select>
            </div>
            <div class="field wide">
              <label for="gpu">GPU</label>
              <select id="gpu" data-field="gpu" required aria-required="true">
                <option value="">Select a GPU…</option>
                ${optionMarkup(this.#config.gpus, selectedGpu)}
              </select>
            </div>
            ${fieldMarkup({ id: 'isl', field: 'isl', label: 'Input tokens', hint: 'Typical prompt length.', value: seedValue(seed, 'isl', 'islTokens', DEFAULTS.isl) })}
            ${fieldMarkup({ id: 'osl', field: 'osl', label: 'Output tokens', hint: 'Typical response length.', value: seedValue(seed, 'osl', 'oslTokens', DEFAULTS.osl) })}
            ${fieldMarkup({ id: 'concurrency', field: 'concurrency', label: 'Target concurrency', hint: 'Requests running at the same time.', value: seedValue(seed, 'concurrency', null, DEFAULTS.concurrency) })}
            ${fieldMarkup({ id: 'ttft', field: 'ttft', label: 'Target time to first token (ms)', hint: 'Maximum time to the first token.', value: seedValue(seed, 'ttft', 'ttftMs', DEFAULTS.ttft), max: 600000 })}
          </div>
          <div class="results" aria-live="polite"></div>
        </div>
      </section>`;

    this.shadowRoot.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => this.schedule());
    });
    this.schedule(0);
  }

  fullUrl() {
    const value = this.getAttribute('full-url');
    if (!value) return null;
    try {
      const baseUrl = globalThis.document?.baseURI || globalThis.location?.href;
      const parsed = new URL(value, baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      const values = this.values();
      parsed.searchParams.delete('model');
      parsed.searchParams.delete('system');
      const model = this.#config.models.find((item) => item.value === values.model);
      const gpu = this.#config.gpus.find((item) => item.value === values.gpu);
      if (model?.modelPath) parsed.searchParams.set('model', model.modelPath);
      if (gpu?.system) parsed.searchParams.set('system', gpu.system);
      return parsed.href;
    } catch {
      return null;
    }
  }

  fullLinkMarkup() {
    const fullUrl = this.fullUrl();
    if (!fullUrl) return '';
    const label = this.getAttribute('full-label') || 'Open full ConfigIQ';
    return `<a class="full-link" href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
  }

  renderFullLink() {
    const slot = this.shadowRoot?.querySelector('.full-link-slot');
    if (slot) slot.innerHTML = this.fullLinkMarkup();
  }

  renderHeadingLevel() {
    this.shadowRoot?.querySelector('.title')
      ?.setAttribute('aria-level', String(this.headingLevel()));
  }

  values() {
    const value = (name) => this.shadowRoot?.querySelector(`[data-field="${name}"]`)?.value ?? '';
    return {
      model: value('model'), gpu: value('gpu'), isl: value('isl'), osl: value('osl'),
      concurrency: value('concurrency'), ttft: value('ttft'),
    };
  }

  schedule(delay = 500) {
    this.#requestToken += 1;
    const token = this.#requestToken;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#controller?.abort();
    this.#controller = null;
    this.renderFullLink();

    const values = this.values();
    const invalidFields = validateSizingValues(values);
    this.shadowRoot?.querySelectorAll('input[data-field]').forEach((input) => {
      input.setAttribute('aria-invalid', String(invalidFields.includes(input.dataset.field)));
    });
    if (!values.model || !values.gpu) {
      this.showStatus(values.model ? 'Choose a GPU to continue.' : 'Choose a model to continue.');
      return;
    }

    if (invalidFields.length) {
      this.showInputError();
      return;
    }

    this.showStatus('Calculating…');
    this.#timer = setTimeout(() => void this.request(values, token), delay);
  }

  async request(values, token) {
    const payload = buildSizingRequest(this.#config, values);
    if (!payload) {
      this.showError();
      return;
    }

    const controller = new AbortController();
    this.#controller = controller;
    const timeoutMs = positiveInteger(this.getAttribute('timeout-ms'), 95000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.getAttribute('endpoint') || '/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = response.ok ? await response.json() : null;
      const result = normalizeSizingResponse(body);
      if (token !== this.#requestToken) return;
      if (!result) this.showError();
      else this.showResult(result);
    } catch {
      if (token === this.#requestToken) this.showError();
    } finally {
      clearTimeout(timeout);
      if (this.#controller === controller) this.#controller = null;
    }
  }

  showStatus(message) {
    const results = this.shadowRoot?.querySelector('.results');
    if (results) results.innerHTML = `<p class="status">${escapeHtml(message)}</p>`;
  }

  showError() {
    const results = this.shadowRoot?.querySelector('.results');
    if (results) results.innerHTML = '<p class="status error">Sizing is unavailable. Try again in a moment.</p>';
  }

  showInputError() {
    const results = this.shadowRoot?.querySelector('.results');
    if (results) results.innerHTML = '<p class="status error">Enter a positive whole number in every numeric field to request sizing.</p>';
  }

  showResult(result) {
    const metric = (label, value, unit, primary = false) => `
      <div class="stat${primary ? ' primary' : ''}" role="listitem" aria-label="${escapeHtml(`${label}: ${Math.round(value)} ${unit}`)}">
        <strong class="value">${Math.round(value)}<span class="unit">${escapeHtml(unit)}</span></strong>
        <span class="metric">${escapeHtml(label)}</span>
      </div>`;
    const results = this.shadowRoot?.querySelector('.results');
    if (results) results.innerHTML = `
      <div class="stats" role="list" aria-label="Sizing results">
        ${metric('Throughput', result.tokensPerSecond, 'tokens/s', true)}
        ${metric('Time to first token', result.ttftLatencyMs, 'ms')}
        ${metric('Time per output token', result.tpotMs, 'ms')}
      </div>`;
  }
}

if (globalThis.customElements && !globalThis.customElements.get('configiq-sizing-widget')) {
  globalThis.customElements.define('configiq-sizing-widget', ConfigIqSizingWidget);
}
