(() => {
  'use strict';

  const PREFIX = '#para-antonela-';
  const MAGIC = [65, 71, 70, 84, 49]; // AGFT1
  const IV_BYTES = 12;
  const root = document.getElementById('gift-experience');
  const envelope = root?.querySelector('[data-gift-envelope]');
  const letter = root?.querySelector('[data-gift-letter]');
  const status = root?.querySelector('[data-gift-status]');
  const publicSurface = Array.from(document.querySelectorAll('.skip-link, .site-header, #contenido, .site-footer'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let routeVersion = 0;
  let controller;
  let openingTimer;
  let objectUrls = [];

  if (!root || !envelope || !letter || !status) return;

  function setPublicSurfaceHidden(hidden) {
    publicSurface.forEach(element => { element.inert = hidden; });
  }

  function revokePhotos() {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  function resetPrivateContent() {
    controller?.abort();
    controller = undefined;
    window.clearTimeout(openingTimer);
    openingTimer = undefined;
    revokePhotos();
    letter.replaceChildren();
    letter.hidden = true;
    envelope.hidden = true;
    envelope.setAttribute('aria-expanded', 'false');
    root.dataset.state = 'idle';
    status.textContent = '';
  }

  function leaveGift() {
    routeVersion += 1;
    resetPrivateContent();
    root.hidden = true;
    document.body.classList.remove('gift-route-active');
    setPublicSurfaceHidden(false);
  }

  function enterGift() {
    resetPrivateContent();
    root.hidden = false;
    root.dataset.state = 'loading';
    document.body.classList.add('gift-route-active');
    setPublicSurfaceHidden(true);
    status.textContent = 'Preparando la carta…';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function decodeSecret(value) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('invalid secret');
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '=';
    const binary = atob(base64);
    if (binary.length !== 32) throw new Error('invalid secret length');
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function decryptAsset(filename, key, signal) {
    const response = await fetch(new URL(`assets/gift/${filename}`, document.baseURI), {
      cache: 'no-store',
      signal
    });
    if (!response.ok) throw new Error('asset unavailable');
    const encrypted = new Uint8Array(await response.arrayBuffer());
    const minimumLength = MAGIC.length + IV_BYTES + 16;
    if (encrypted.length < minimumLength || MAGIC.some((byte, index) => encrypted[index] !== byte)) {
      throw new Error('invalid encrypted asset');
    }
    const iv = encrypted.slice(MAGIC.length, MAGIC.length + IV_BYTES);
    const authenticatedCiphertext = encrypted.slice(MAGIC.length + IV_BYTES);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, authenticatedCiphertext);
  }

  function isText(value, maximum = 1200) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum;
  }

  function validateContent(content) {
    if (!content || content.version !== 1) throw new Error('invalid content version');
    for (const field of ['title', 'subtitle', 'salutation', 'opening', 'closing', 'signature']) {
      if (!isText(content[field])) throw new Error(`invalid ${field}`);
    }
    if (!Array.isArray(content.sections) || content.sections.length !== 5 || content.sections.some(section => !isText(section?.title, 120) || !isText(section?.body))) {
      throw new Error('invalid sections');
    }
    if (!Array.isArray(content.photos) || content.photos.length !== 4) throw new Error('invalid photos');
    content.photos.forEach((photo, index) => {
      if (photo?.file !== `photo-0${index + 1}.enc`) throw new Error('invalid photo filename');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mime)) throw new Error('invalid photo type');
      if (!isText(photo.alt, 240) || !/^\d{1,3}% \d{1,3}%$/.test(photo.position)) throw new Error('invalid photo metadata');
    });
    return content;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function photoFigure(photo, url, variant) {
    const figure = element('figure', `gift-photo gift-photo-${variant}`);
    const image = document.createElement('img');
    image.src = url;
    image.alt = photo.alt;
    image.style.objectPosition = photo.position;
    image.decoding = 'async';
    image.dataset.giftPhoto = '';
    figure.append(image);
    return figure;
  }

  function proseSection(section) {
    const container = element('section', 'gift-prose');
    container.dataset.giftSection = '';
    container.append(element('h2', '', section.title), element('p', '', section.body));
    return container;
  }

  function renderLetter(content, urls) {
    const header = element('header', 'gift-letter-header');
    const subtitle = element('p', 'gift-letter-subtitle', content.subtitle);
    const title = element('h1', '', content.title);
    title.tabIndex = -1;
    title.dataset.giftTitle = '';
    header.append(subtitle, title);

    const intro = element('div', 'gift-intro');
    const introCopy = element('div', 'gift-intro-copy');
    introCopy.append(element('p', 'gift-salutation', content.salutation), element('p', '', content.opening));
    intro.append(photoFigure(content.photos[1], urls[1], 'sea'), introCopy);

    const firstPair = element('div', 'gift-prose-pair');
    firstPair.append(proseSection(content.sections[0]), proseSection(content.sections[1]));

    const daily = element('div', 'gift-memory gift-memory-daily');
    daily.append(photoFigure(content.photos[0], urls[0], 'daily'), proseSection(content.sections[2]));

    const evening = element('div', 'gift-memory gift-memory-evening');
    evening.append(proseSection(content.sections[3]), photoFigure(content.photos[2], urls[2], 'evening'));

    const promise = element('div', 'gift-memory gift-memory-promise');
    promise.append(photoFigure(content.photos[3], urls[3], 'promise'), proseSection(content.sections[4]));

    const closing = element('footer', 'gift-letter-closing');
    closing.append(element('p', '', content.closing), element('p', 'gift-signature', content.signature));

    letter.replaceChildren(header, intro, firstPair, daily, evening, promise, closing);
    return title;
  }

  function showError() {
    revokePhotos();
    letter.replaceChildren();
    letter.hidden = true;
    envelope.hidden = true;
    root.dataset.state = 'error';
    status.textContent = 'Este enlace no puede abrir la carta. Revisá el enlace completo.';
  }

  function revealLetter() {
    if (root.dataset.state !== 'opening' && root.dataset.state !== 'ready') return;
    root.dataset.state = 'open';
    envelope.hidden = true;
    letter.hidden = false;
    status.textContent = 'Carta abierta.';
    const title = letter.querySelector('[data-gift-title]');
    title?.focus({ preventScroll: true });
    title?.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function openEnvelope() {
    if (root.dataset.state !== 'ready') return;
    envelope.setAttribute('aria-expanded', 'true');
    root.dataset.state = 'opening';
    status.textContent = 'Abriendo la carta…';
    if (reducedMotion.matches) {
      revealLetter();
      return;
    }
    openingTimer = window.setTimeout(revealLetter, 1050);
  }

  async function syncRoute() {
    const hash = location.hash;
    if (!hash.startsWith(PREFIX)) {
      leaveGift();
      return;
    }

    const version = ++routeVersion;
    enterGift();
    const encodedSecret = hash.slice(PREFIX.length);
    let rawKey;
    try {
      rawKey = decodeSecret(encodedSecret);
    } catch (_) {
      showError();
      return;
    }

    controller = new AbortController();
    try {
      const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
      rawKey.fill(0);
      const contentBuffer = await decryptAsset('content.enc', key, controller.signal);
      const content = validateContent(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contentBuffer)));
      const photoBuffers = await Promise.all(content.photos.map(photo => decryptAsset(photo.file, key, controller.signal)));
      if (version !== routeVersion) return;
      const urls = photoBuffers.map((buffer, index) => URL.createObjectURL(new Blob([buffer], { type: content.photos[index].mime })));
      objectUrls = urls;
      renderLetter(content, urls);
      root.dataset.state = 'ready';
      envelope.hidden = false;
      status.textContent = 'La carta está lista.';
      envelope.focus({ preventScroll: true });
    } catch (error) {
      if (error.name !== 'AbortError' && version === routeVersion) showError();
    }
  }

  envelope.addEventListener('click', openEnvelope);
  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('pageshow', event => { if (event.persisted) syncRoute(); });
  window.addEventListener('pagehide', leaveGift);
  syncRoute();
})();
