const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { encryptPayload, decryptPayload } = require('../scripts/encrypt-gift-assets.cjs');

const root = path.resolve(__dirname, '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function withPage(run, options = {}, language, setup) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
  if (language) await context.addInitScript(value => localStorage.setItem('portfolio-language', value), language);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    if (setup) await setup(page);
    await page.goto(url, { waitUntil: 'load' });
    await run(page);
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
  } finally {
    await context.close();
  }
}

const text = (page, selector) => page.locator(selector).textContent();

test('language switch translates case studies without closing them', () => withPage(async page => {
  await page.locator('.project-case summary').first().click();
  await page.locator('[data-language="en"]').click();
  assert.equal(await page.locator('.project-case').first().getAttribute('open'), '');
  assert.equal(await text(page, '.project-case dt >> nth=0'), 'The problem');
  assert.equal(await page.locator('.project-case summary').first().getAttribute('aria-label'), 'How I built it: Multi-Market');
  await page.locator('[data-language="es"]').click();
  assert.equal(await text(page, '.project-case dt >> nth=0'), 'El problema');
  assert.equal(await page.locator('.project-case').first().getAttribute('open'), '');
}));

test('persisted English initializes the portfolio with complete translations', () => withPage(async page => {
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const invalid = await page.evaluate(() => [...document.querySelectorAll('[data-i18n], [data-i18n-aria]')].filter(element => {
    const key = element.dataset.i18n || element.dataset.i18nAria;
    return !translations.es[key] || !translations.en[key];
  }).map(element => element.outerHTML));
  assert.deepEqual(invalid, []);
}, {}, 'en'));

test('Patagonia route hero connects three real engineering capabilities', () => withPage(async page => {
  assert.equal(await page.locator('.system-console').count(), 0);
  assert.equal(await page.locator('.hero-landscape').count(), 1);
  assert.equal(await page.locator('.software-route [data-route-node]').count(), 3);
  assert.match(await text(page, '.software-route'), /Diseño de API.*Integraciones.*Calidad verificable/s);
  assert.equal(await page.locator('.hero').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('topography.svg')), true);
  assert.equal(await page.locator('.route-progress').count(), 1);

  await page.locator('[data-language="en"]').click();
  assert.match(await text(page, '.software-route'), /API design.*Integrations.*Verifiable quality/s);
}));

test('six case studies expose all four dimensions and retain the OCR limitation', () => withPage(async page => {
  assert.equal(await page.locator('.project-case').count(), 6);
  for (const details of await page.locator('.project-case').all()) {
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await details.getAttribute('open'), '');
    assert.equal(await details.locator('dt').count(), 4);
    assert.equal(await details.locator('dd').count(), 4);
    assert.equal(await details.locator('dd').first().isVisible(), true);
    await page.keyboard.press('Space');
    assert.equal(await details.getAttribute('open'), null);
  }
  assert.match(await text(page, '[data-i18n="ocrCaseOutcome"]'), /experimental.*errores/s);
}));

test('no JavaScript leaves case studies usable', () => withPage(async page => {
  await page.locator('.project-case summary').first().click();
  assert.equal(await page.locator('.project-case dd').first().isVisible(), true);
  assert.equal(await page.locator('.experience-card').count(), 3);
}, { javaScriptEnabled: false }));

for (const width of [1440, 980, 760, 390, 320]) {
  test(`responsive layout at ${width}px keeps page and expanded content in bounds`, () => withPage(async page => {
    await page.locator('.project-case summary').first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.project-case dd').first().isVisible(), true);
    assert.equal(await page.locator('.experience-section').evaluate(element => getComputedStyle(element, '::before').backgroundImage.includes('topography.svg')), true);
    const route = await page.locator('.software-route').boundingBox();
    assert.ok(route && route.x >= 0 && route.x + route.width <= width, 'Software route stays inside the viewport');
    if (process.env.PORTFOLIO_SCREENSHOTS) {
      const output = path.resolve(process.env.PORTFOLIO_SCREENSHOTS);
      fs.mkdirSync(output, { recursive: true });
      async function capture(selector, filename) {
        const element = page.locator(selector).first();
        const box = await element.boundingBox();
        // Capture a real viewport so fixed offscreen elements stay outside the image.
        await page.setViewportSize({ width, height: Math.ceil(box.height) });
        await element.evaluate(target => window.scrollTo({ top: target.getBoundingClientRect().top + scrollY, behavior: 'instant' }));
        await page.screenshot({ path: path.join(output, filename) });
      }
      await capture('.experience-section', `experience-${width}.png`);
      if (width === 1440 || width === 390) await capture('.project-card', `case-${width}.png`);
    }
  }, { viewport: { width, height: 1000 } }));
}

test('reduced motion preserves readable content and readable content', () => withPage(async page => {
  assert.equal(await page.locator('.scroll-reveal-pending').count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
}));

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1024, 768]]) {
  test(`compact navigation stays reachable and fits a touch screen at ${width}x${height}`, () => withPage(async page => {
    for (const selector of ['.menu-toggle', '[data-language="es"]', '[data-language="en"]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${selector}: 44px touch target`);
    }
    await page.locator('#stack').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const header = await page.locator('.site-header').boundingBox();
    assert.ok(header.y >= 0 && header.y + header.height < height, 'Header remains on screen');
    assert.ok((await page.locator('#stack').boundingBox()).y >= header.y + header.height, 'Anchor clears the header');
    await page.locator('.menu-toggle').tap();
    const menu = await page.locator('.nav-menu').boundingBox();
    assert.ok(menu.y >= header.y + header.height && menu.y + menu.height <= height, 'Menu fits the available height');
    await page.locator('.nav-menu a[href="#contacto"]').tap();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    assert.ok((await page.locator('#contacto').boundingBox()).y >= header.height - 1, 'Contact is not hidden behind header');
    await page.locator('.menu-toggle').tap();
    await page.touchscreen.tap(width - 3, height - 3);
    assert.equal(await page.locator('.nav-menu').isVisible(), false, 'Outside touch dismisses the menu');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }, { viewport: { width, height }, isMobile: true, hasTouch: true }));
}

test('compact navigation handles Escape, focus leaving and breakpoint changes', () => withPage(async page => {
  const toggle = page.locator('.menu-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.nav-menu a').first().evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await toggle.evaluate(node => node === document.activeElement), true);
  await toggle.click();
  await page.locator('[data-language="en"]').focus();
  assert.equal(await page.locator('.nav-menu').isVisible(), false);
  await toggle.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
  assert.equal(await toggle.isVisible(), false);
  assert.equal(await page.locator('.nav-menu').isVisible(), true);
  await page.locator('.nav-menu a').first().focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.activeElement === document.querySelector('.menu-toggle'));
  assert.equal(await page.locator('.nav-menu').isVisible(), false);
}, { viewport: { width: 390, height: 844 } }));

test('wide tablet keeps navigation visible and language buttons large enough for touch', () => withPage(async page => {
  await page.locator('#stack').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const header = await page.locator('.site-header').boundingBox();
  assert.equal(header.y, 0);
  assert.equal(await page.locator('.nav-menu').isVisible(), true);
  for (const button of await page.locator('.language-switch button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  for (const link of await page.locator('.nav-menu a').all()) {
    assert.ok((await link.boundingBox()).height >= 44);
  }
  await page.locator('[data-language="en"]').tap();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}, { viewport: { width: 1366, height: 1024 }, isMobile: true, hasTouch: true }));

test('mobile navigation remains available without JavaScript', () => withPage(async page => {
  assert.equal(await page.locator('.menu-toggle').isVisible(), false);
  assert.equal(await page.locator('.nav-menu').isVisible(), true);
  await page.locator('.nav-menu a[href="#proyectos"]').click();
  assert.ok((await page.locator('#proyectos').boundingBox()).y >= 0);
}, { viewport: { width: 390, height: 844 }, javaScriptEnabled: false }));

const giftTestKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1));
const giftTestFragment = `#para-antonela-${giftTestKey.toString('base64url')}`;
const giftPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function encryptedGiftFixtures(key = giftTestKey) {
  const content = {
    version: 1,
    title: 'Dos personas de prueba',
    subtitle: 'Una carta cifrada',
    salutation: 'Hola:',
    opening: 'Este contenido existe sólo para probar el descifrado.',
    sections: Array.from({ length: 5 }, (_, index) => ({
      title: `Motivo ${index + 1}`,
      body: `Texto privado de prueba ${index + 1}.`
    })),
    closing: 'Cierre de prueba.',
    signature: 'L',
    photos: Array.from({ length: 4 }, (_, index) => ({
      file: `photo-0${index + 1}.enc`,
      mime: 'image/png',
      alt: `Recuerdo de prueba ${index + 1}`,
      position: '50% 50%'
    }))
  };
  const fixtures = new Map([
    ['content.enc', encryptPayload(Buffer.from(JSON.stringify(content)), key)]
  ]);
  content.photos.forEach(photo => fixtures.set(photo.file, encryptPayload(giftPixel, key)));
  return fixtures;
}

async function serveGiftFixtures(page, fixtures, requests = []) {
  await page.route('**/assets/gift/*', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').pop();
    requests.push(filename);
    const body = fixtures.get(filename);
    if (!body) return route.fulfill({ status: 404, body: 'missing' });
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body });
  });
}

test('gift encryption round-trips and rejects tampered ciphertext', () => {
  const payload = Buffer.from('contenido privado de prueba');
  const encrypted = encryptPayload(payload, giftTestKey);
  assert.deepEqual(decryptPayload(encrypted, giftTestKey), payload);
  const tampered = Buffer.from(encrypted);
  tampered[20] ^= 1;
  assert.throws(() => decryptPayload(tampered, giftTestKey));
  assert.notEqual(encrypted.subarray(0, 4).toString('hex'), '89504e47');
  assert.notEqual(encrypted.subarray(0, 3).toString('hex'), 'ffd8ff');
});

test('unrelated hashes keep the portfolio visible without requesting gift assets', () => {
  const requests = [];
  return withPage(async page => {
    await page.evaluate(() => { location.hash = '#proyectos'; });
    await page.waitForFunction(() => location.hash === '#proyectos');
    assert.equal(await page.locator('#gift-experience').isVisible(), false);
    assert.equal(await page.locator('#contenido').isVisible(), true);
    assert.deepEqual(requests, []);
  }, {}, undefined, page => serveGiftFixtures(page, encryptedGiftFixtures(), requests));
});

test('the complete secret link decrypts the gift and opens it from the keyboard', () => {
  const requests = [];
  return withPage(async page => {
    await page.evaluate(fragment => { location.hash = fragment; }, giftTestFragment);
    await page.waitForFunction(() => document.body.classList.contains('gift-route-active') && !document.querySelector('[data-gift-envelope]').hidden);
    assert.equal(await page.locator('#contenido').isVisible(), false);
    assert.equal(await page.locator('[data-gift-letter]').isVisible(), false);
    assert.deepEqual(requests.sort(), ['content.enc', 'photo-01.enc', 'photo-02.enc', 'photo-03.enc', 'photo-04.enc']);

    const envelope = page.locator('[data-gift-envelope]');
    await envelope.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-gift-letter]').hidden);
    assert.equal(await page.locator('[data-gift-title]').textContent(), 'Dos personas de prueba');
    assert.equal(await page.locator('[data-gift-section]').count(), 5);
    assert.equal(await page.locator('[data-gift-photo]').count(), 4);
    assert.equal(await page.locator('[data-gift-title]').evaluate(node => node === document.activeElement), true);
    assert.equal((await page.locator('[data-gift-photo]').first().getAttribute('src')).startsWith('blob:'), true);
    assert.equal((await page.locator('body').textContent()).includes(giftTestKey.toString('base64url')), false);

    const revokedUrl = await page.locator('[data-gift-photo]').first().getAttribute('src');
    await page.evaluate(() => { location.hash = '#inicio'; });
    await page.waitForFunction(() => document.querySelector('#gift-experience').hidden);
    assert.equal(await page.locator('#contenido').isVisible(), true);
    assert.equal(await page.evaluate(url => fetch(url).then(() => false, () => true), revokedUrl), true);
  }, {}, undefined, page => serveGiftFixtures(page, encryptedGiftFixtures(), requests));
});

test('invalid or incorrect gift keys never reveal partial content', () => {
  const requests = [];
  return withPage(async page => {
    await page.evaluate(() => { location.hash = '#para-antonela-incompleta'; });
    await page.waitForFunction(() => document.body.classList.contains('gift-route-active'));
    assert.match(await page.locator('[data-gift-status]').textContent(), /enlace completo/i);
    assert.equal(await page.locator('[data-gift-letter]').isVisible(), false);
    assert.deepEqual(requests, []);

    const wrongKey = crypto.randomBytes(32).toString('base64url');
    const encryptedRequest = page.waitForRequest('**/assets/gift/content.enc');
    await page.evaluate(key => { location.hash = `#para-antonela-${key}`; }, wrongKey);
    await encryptedRequest;
    await page.waitForFunction(() => document.querySelector('#gift-experience').dataset.state === 'error');
    assert.equal(await page.locator('[data-gift-letter]').isVisible(), false);
    assert.deepEqual(requests, ['content.enc']);
  }, {}, undefined, page => serveGiftFixtures(page, encryptedGiftFixtures(), requests));
});

test('reduced motion opens the encrypted letter without an animation delay', () => withPage(async page => {
  await page.evaluate(fragment => { location.hash = fragment; }, giftTestFragment);
  await page.waitForFunction(() => !document.querySelector('[data-gift-envelope]').hidden);
  await page.locator('[data-gift-envelope]').click();
  assert.equal(await page.locator('[data-gift-letter]').isVisible(), true);
  assert.equal(await page.locator('#gift-experience').getAttribute('data-state'), 'open');
}, { reducedMotion: 'reduce' }, undefined, page => serveGiftFixtures(page, encryptedGiftFixtures())));
