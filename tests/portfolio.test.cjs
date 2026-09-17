const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

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
const select = (page, field, value) => page.locator(`#demo-${field}`).selectOption(value);

test('demo initializes with eight fictional records and exact totals', () => withPage(async page => {
  assert.equal(await page.locator('#demo-report tbody tr').count(), 8);
  assert.equal(await text(page, '[data-demo-total]'), '21 h 30 min');
  assert.equal(await text(page, '[data-demo-count]'), '8');
  assert.equal(await text(page, '[data-demo-companies]'), '2');
  assert.equal(await page.locator('.demo-fallback').isVisible(), false);
  assert.equal(await page.locator('#demo-company').isEnabled(), true);
  assert.match(await text(page, '.demo-sample'), /Datos ficticios/);
}));

test('filters intersect company, person and period without rounding errors', () => withPage(async page => {
  await select(page, 'company', 'Estudio Sur');
  await select(page, 'person', 'Ana');
  assert.equal(await text(page, '[data-demo-total]'), '6 h 30 min');
  assert.equal(await page.locator('#demo-report tbody tr').count(), 2);
  await select(page, 'period', 'first');
  assert.equal(await text(page, '[data-demo-total]'), '3 h');
  assert.equal(await page.locator('#demo-report tbody tr').count(), 1);
  assert.match(await text(page, '#demo-report tbody'), /Ana.*Estudio Sur.*Desarrollo backend/s);
  await select(page, 'period', 'second');
  assert.equal(await text(page, '[data-demo-total]'), '3 h 30 min');
  assert.equal(await text(page, '[data-demo-companies]'), '1');
}));

test('period boundaries include first and last sample dates', () => withPage(async page => {
  await select(page, 'period', 'first');
  assert.equal(await text(page, '[data-demo-count]'), '5');
  assert.equal(await text(page, '[data-demo-total]'), '13 h');
  await select(page, 'period', 'second');
  assert.equal(await text(page, '[data-demo-count]'), '3');
  assert.equal(await text(page, '[data-demo-total]'), '8 h 30 min');
}));

test('report groups sum to the selected records and refresh while open', () => withPage(async page => {
  await page.locator('.demo-report summary').click();
  assert.deepEqual(await page.locator('.demo-report-groups strong').allTextContents(), ['11 h 15 min', '10 h 15 min']);
  assert.equal(await text(page, '[data-demo-report-total]'), '21 h 30 min');
  const widths = await page.locator('.demo-report-track > span').evaluateAll(elements => elements.map(element => parseFloat(element.style.width)));
  assert.ok(Math.abs(widths.reduce((sum, value) => sum + value, 0) - 100) < 0.0001);
  await select(page, 'company', 'Faro Digital');
  assert.equal(await page.locator('.demo-report').getAttribute('open'), '');
  assert.equal(await page.locator('.demo-report-groups li').count(), 1);
  assert.equal(await text(page, '[data-demo-report-total]'), '10 h 15 min');
  assert.match(await text(page, '.demo-report-groups'), /Faro Digital/);
}));

test('empty selection clears table, report and totals; reset restores all data', () => withPage(async page => {
  await page.locator('.demo-report summary').click();
  await select(page, 'company', 'Faro Digital');
  await select(page, 'person', 'Lucía');
  assert.equal(await page.locator('#demo-report tbody tr').count(), 0);
  assert.equal(await page.locator('.demo-empty').isVisible(), true);
  assert.equal(await page.locator('.demo-table-wrap').isVisible(), false);
  assert.equal(await text(page, '[data-demo-total]'), '0 h');
  assert.equal(await text(page, '[data-demo-companies]'), '0');
  assert.equal(await text(page, '[data-demo-report-total]'), '0 h');
  assert.equal(await page.locator('.demo-report-groups li').count(), 0);
  assert.equal(await page.locator('.demo-report-empty').isVisible(), true);
  await page.locator('[data-demo-reset]').click();
  assert.equal(await text(page, '[data-demo-total]'), '21 h 30 min');
  assert.equal(await page.locator('#demo-report tbody tr').count(), 8);
  assert.equal(await page.locator('.demo-empty').isVisible(), false);
  assert.equal(await page.locator('.demo-report-empty').isVisible(), false);
  assert.equal(await page.locator('.demo-report').getAttribute('open'), '');
  assert.deepEqual(await page.locator('.demo-filters select').evaluateAll(elements => elements.map(element => element.value)), ['', '', '']);
}));

test('language switch translates dynamic data without losing filters or disclosures', () => withPage(async page => {
  await select(page, 'company', 'Estudio Sur');
  await page.locator('.demo-report summary').click();
  await page.locator('.project-case summary').first().click();
  await page.locator('[data-language="en"]').click();
  assert.equal(await page.locator('#demo-company').inputValue(), 'Estudio Sur');
  assert.equal(await text(page, '[data-demo-total]'), '11 h 15 min');
  assert.equal(await text(page, '#demo-title'), 'Try a little Report+.');
  assert.match(await text(page, '#demo-report tbody'), /Backend development/);
  assert.match(await text(page, '[data-demo-status]'), /4 records found/);
  assert.equal(await page.locator('.project-case').first().getAttribute('open'), '');
  assert.equal(await page.locator('.demo-report').getAttribute('open'), '');
  assert.equal(await text(page, '.project-case dt >> nth=0'), 'The problem');
  await page.locator('[data-language="es"]').click();
  assert.match(await text(page, '#demo-report tbody'), /Desarrollo backend/);
  assert.equal(await text(page, '[data-demo-total]'), '11 h 15 min');
}));

test('persisted English initializes all new copy and dynamic task names', () => withPage(async page => {
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await text(page, '#demo-title'), 'Try a little Report+.');
  assert.match(await text(page, '#demo-report tbody'), /API integration/);
  const invalid = await page.evaluate(() => [...document.querySelectorAll('[data-i18n], [data-i18n-aria]')].filter(element => {
    const key = element.dataset.i18n || element.dataset.i18nAria;
    return !translations.es[key] || !translations.en[key];
  }).map(element => element.outerHTML));
  assert.deepEqual(invalid, []);
}, {}, 'en'));

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

test('demo controls and report work through keyboard and announce results', () => withPage(async page => {
  await page.locator('#demo-company').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#demo-company').inputValue(), 'Estudio Sur');
  assert.equal(await text(page, '[data-demo-count]'), '4');
  assert.match(await text(page, '#demo-report [role="status"]'), /4 registros encontrados/);
  await page.locator('.demo-report summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.demo-report-content').isVisible(), true);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.demo-report-content').isVisible(), false);
}));

test('no JavaScript leaves case studies usable and demo explicitly unavailable', () => withPage(async page => {
  assert.equal(await page.locator('.demo-fallback').isVisible(), true);
  assert.equal(await page.locator('#demo-company').isEnabled(), false);
  assert.equal(await page.locator('.demo-results').isVisible(), false);
  await page.locator('.project-case summary').first().click();
  assert.equal(await page.locator('.project-case dd').first().isVisible(), true);
  assert.equal(await page.locator('.experience-card').count(), 3);
}, { javaScriptEnabled: false }));

test('missing demo script preserves its fallback and native case studies', () => withPage(async page => {
  assert.equal(await page.locator('.demo-fallback').isVisible(), true);
  assert.equal(await page.locator('#demo-company').isEnabled(), false);
  assert.equal(await page.locator('.demo-results').isVisible(), false);
  await page.locator('.project-case summary').first().click();
  assert.equal(await page.locator('.project-case dd').first().isVisible(), true);
}, {}, undefined, page => page.route('**/assets/js/report-demo.js', route => route.abort())));

for (const width of [1440, 980, 760, 390, 320]) {
  test(`responsive layout at ${width}px keeps page, filters and expanded content in bounds`, () => withPage(async page => {
    await page.locator('.project-case summary').first().click();
    await page.locator('.demo-report summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const selectControl of await page.locator('.demo-filters select').all()) {
      const box = await selectControl.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.height >= 44);
    }
    assert.equal(await page.locator('.demo-report-content').isVisible(), true);
    assert.match(await page.locator('.experience-section').evaluate(element => getComputedStyle(element, '::before').backgroundImage), /topography\.svg/);
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
      await capture('.report-demo', `demo-${width}.png`);
      await capture('.experience-section', `experience-${width}.png`);
      if (width === 1440 || width === 390) await capture('.project-card', `case-${width}.png`);
    }
  }, { viewport: { width, height: 1000 } }));
}

test('reduced motion preserves readable content and usable filters', () => withPage(async page => {
  assert.equal(await page.locator('.scroll-reveal-pending').count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  await select(page, 'person', 'Lucía');
  assert.equal(await text(page, '[data-demo-total]'), '4 h 45 min');
}));

test('demo becomes visible when scrolled into view with animations enabled', () => withPage(async page => {
  await page.locator('#demo-report').evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForFunction(() => {
    const demo = document.getElementById('demo-report');
    return getComputedStyle(demo).opacity === '1' && demo.getAnimations().length === 0;
  });
  assert.equal(await page.locator('#demo-company').isEnabled(), true);
  await select(page, 'company', 'Faro Digital');
  assert.equal(await text(page, '[data-demo-total]'), '10 h 15 min');
}, { reducedMotion: 'no-preference' }));

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1024, 768]]) {
  test(`compact navigation stays reachable and fits a touch screen at ${width}x${height}`, () => withPage(async page => {
    for (const selector of ['.menu-toggle', '[data-language="es"]', '[data-language="en"]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${selector}: 44px touch target`);
    }
    await page.locator('#demo-market').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const header = await page.locator('.site-header').boundingBox();
    assert.ok(header.y >= 0 && header.y + header.height < height, 'Header remains on screen');
    assert.ok((await page.locator('#demo-market').boundingBox()).y >= header.y + header.height, 'Anchor clears the header');
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
  await page.locator('#demo-market').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
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

test('mobile report shows all fields without side scrolling and updates their labels with language', () => withPage(async page => {
  const table = page.locator('.demo-table-wrap');
  assert.equal(await table.evaluate(node => node.scrollWidth <= node.clientWidth), true);
  const firstRow = page.locator('#demo-report tbody tr').first();
  assert.deepEqual(await firstRow.locator('.demo-cell-label').allTextContents(), ['Fecha', 'Persona', 'Empresa', 'Tarea', 'Tiempo']);
  assert.equal(await firstRow.getByRole('cell').count(), 5);
  for (const cell of await firstRow.locator('td').all()) {
    const box = await cell.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
  }
  await select(page, 'company', 'Faro Digital');
  await page.locator('[data-language="en"]').click();
  assert.deepEqual(await firstRow.locator('.demo-cell-label').allTextContents(), ['Date', 'Person', 'Company', 'Task', 'Time']);
  assert.equal(await text(page, '[data-demo-total]'), '10 h 15 min');
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(await firstRow.locator('.demo-cell-label').first().isVisible(), false);
  assert.equal(await page.locator('#demo-report thead').isVisible(), true);
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));

test('mobile catalog is compact and product close stays available after scrolling in landscape', () => withPage(async page => {
  assert.ok((await page.locator('#demo-market').boundingBox()).height < 2400, 'Catalog is shorter than the 3248px baseline');
  await page.locator('.market-product').first().tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('.market-dialog-note').scrollIntoViewIfNeeded();
  const close = await page.locator('[data-market-close]').boundingBox();
  assert.ok(close.y >= 0 && close.y + close.height <= 390, 'Close remains visible after scrolling details');
  await page.locator('[data-market-close]').tap();
  assert.equal(await page.locator('#market-product-dialog').isVisible(), false);
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));

const marketCards = page => page.locator('.market-product');
const marketIds = page => marketCards(page).evaluateAll(cards => cards.map(card => card.dataset.productId));
const marketSelect = (page, field, value) => page.locator(`#market-${field}`).selectOption(value);
const marketSearch = (page, value) => page.locator('#market-search').fill(value);
const marketRequest = page => text(page, '[data-market-request]');

test('market shows six illustrated sample products with ARS prices and independent Report+ data', () => withPage(async page => {
  assert.equal(await marketCards(page).count(), 6);
  assert.match(await text(page, '.market-sample'), /Catálogo ficticio.*ARS.*sin compras/);
  assert.equal(await page.locator('.market-fallback').isVisible(), false);
  assert.equal(await page.locator('#market-search').isEnabled(), true);
  assert.deepEqual(await page.locator('.market-product-shop').allTextContents(), ['Sendero', 'Refugio', 'Sendero', 'Refugio', 'Lago', 'Lago']);
  const images = await page.locator('.market-product img').evaluateAll(nodes => nodes.map(image => ({ loaded: image.complete && image.naturalWidth > 0, src: image.getAttribute('src') })));
  assert.equal(images.length, 6);
  assert.ok(images.every(image => image.loaded && image.src.startsWith('assets/img/market/')));
  assert.ok((await page.locator('.market-product-price strong').allTextContents()).every(price => price.startsWith('ARS')));
  await marketSelect(page, 'shop', '1');
  await select(page, 'person', 'Ana');
  assert.deepEqual(await marketIds(page), ['101', '103']);
  assert.equal(await text(page, '[data-demo-count]'), '3');
  await page.locator('[data-market-reset]').click();
  assert.equal(await text(page, '[data-demo-count]'), '3');
}));

test('market search ignores accents, case and extra outer spaces; intersects both filters', () => withPage(async page => {
  await marketSearch(page, '  TERMICA  ');
  assert.deepEqual(await marketIds(page), ['102']);
  assert.equal(await text(page, '[data-market-count]'), '1 producto para explorar');
  await marketSearch(page, '');
  await marketSelect(page, 'shop', '1');
  await marketSelect(page, 'category', '1');
  assert.deepEqual(await marketIds(page), ['101']);
  await marketSearch(page, 'polar');
  assert.equal(await marketCards(page).count(), 0);
  assert.equal(await page.locator('.market-grid').isVisible(), false);
  assert.equal(await page.locator('.market-empty').isVisible(), true);
  assert.match(await text(page, '[data-market-count]'), /^0 productos/);
  await page.locator('[data-market-empty-reset]').click();
  assert.equal(await marketCards(page).count(), 6);
  assert.equal(await page.locator('#market-search').inputValue(), '');
  assert.equal(await page.locator('#market-shop').inputValue(), '');
  assert.equal(await page.locator('#market-category').inputValue(), '');
  assert.equal(await page.locator('#market-search').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('.market-empty').isVisible(), false);
  await marketSearch(page, 'REFUGIO');
  assert.deepEqual(await marketIds(page), ['102', '104']);
  await marketSearch(page, 'indumentaria');
  assert.deepEqual(await marketIds(page), ['103', '105']);
}));

test('opening a search result works on its first click when the search input loses focus', () => withPage(async page => {
  await marketSearch(page, 'mochila');
  assert.equal(await page.locator('#market-search').evaluate(node => node === document.activeElement), true);
  await marketCards(page).first().click();
  assert.equal(await page.locator('#market-product-dialog').isVisible(), true);
  assert.equal(await text(page, '#market-dialog-title'), 'Mochila Andina');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.dataset.productId === '101');
}));

test('market API panel shows real route combinations and discloses local search refinement', () => withPage(async page => {
  await page.locator('.market-api summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.market-api-content').isVisible(), true);
  assert.equal(await marketRequest(page), 'GET /api/products/search/');
  assert.match(await text(page, '[data-i18n="marketApiIntro"]'), /datos locales.*no envía solicitudes/);
  await marketSelect(page, 'shop', '3');
  assert.equal(await marketRequest(page), 'GET /api/products/shop/3/');
  await marketSelect(page, 'category', '1');
  assert.equal(await marketRequest(page), 'GET /api/products/shop/3/category/1/?page=1&limit=6');
  assert.deepEqual(await marketIds(page), ['106']);
  await marketSelect(page, 'shop', '');
  assert.equal(await marketRequest(page), 'GET /api/products/category/1/?page=1&limit=6');
  await marketSearch(page, 'Mochila Andina');
  assert.equal(await marketRequest(page), 'GET /api/products/search/?query=Mochila+Andina');
  assert.equal(await page.locator('[data-market-local-filter]').isVisible(), true);
  await page.locator('[data-market-reset]').click();
  assert.equal(await page.locator('[data-market-local-filter]').isVisible(), false);
  assert.equal(await page.locator('.market-api').getAttribute('open'), '');
  assert.equal(await marketRequest(page), 'GET /api/products/search/');
  await page.locator('.market-api summary').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.market-api-content').isVisible(), false);
}));

test('market safely displays encoded queries and does not submit or call an API', async () => {
  const apiRequests = [];
  await withPage(async page => {
    const before = page.url();
    await marketSearch(page, '<img src=x onerror=alert(1)> & +');
    await page.keyboard.press('Enter');
    assert.equal(page.url(), before);
    assert.equal(await marketCards(page).count(), 0);
    assert.equal(await page.locator('[data-market-request] img').count(), 0);
    assert.equal(await marketRequest(page), 'GET /api/products/search/?query=%3Cimg+src%3Dx+onerror%3Dalert%281%29%3E+%26+%2B');
    await page.locator('[data-market-reset]').click();
    await marketCards(page).first().click();
    await page.locator('[data-market-close]').click();
    assert.deepEqual(apiRequests, []);
  }, {}, undefined, page => page.on('request', request => {
    if (['fetch', 'xhr'].includes(request.resourceType())) apiRequests.push(request.url());
  }));
});

test('market product dialog supports keyboard, focus containment, Escape and all close controls', () => withPage(async page => {
  const card = page.locator('[data-product-id="101"]');
  const dialog = page.locator('#market-product-dialog');
  await card.focus();
  await page.keyboard.press('Enter');
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await text(page, '#market-dialog-title'), 'Mochila Andina');
  assert.match(await text(page, '[data-market-description]'), /24 litros/);
  assert.equal(await text(page, '[data-market-shop]'), 'Sendero');
  assert.equal(await text(page, '[data-market-category]'), 'Equipamiento');
  assert.match(await page.locator('.market-dialog-visual img').getAttribute('src'), /pack.svg$/);
  assert.equal(await page.locator('[data-market-close]').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).overflow), 'hidden');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('market-dialog-open'));
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await card.evaluate(node => node === document.activeElement), true);
  await card.click();
  await page.locator('[data-market-close]').click();
  assert.equal(await dialog.isVisible(), false);
  await card.click();
  await page.mouse.click(4, 4);
  assert.equal(await dialog.isVisible(), false);
  await page.waitForFunction(() => document.activeElement?.dataset.productId === '101');
}));

test('all product details keep prices, discounts and images consistent with their cards', () => withPage(async page => {
  const expected = [
    ['101', '57.800', '68.000', '15%'], ['102', '24.000', null, null],
    ['103', '46.800', '52.000', '10%'], ['104', '12.500', null, null],
    ['105', '18.000', null, null], ['106', '43.700', '46.000', '5%']
  ];
  for (const [id, price, original, discount] of expected) {
    const card = page.locator(`[data-product-id="${id}"]`);
    await card.click();
    const shownPrice = await text(page, '[data-market-price]');
    assert.equal(shownPrice, await card.locator('.market-product-price strong').textContent());
    assert.ok(shownPrice.includes(price));
    assert.equal(await text(page, '#market-dialog-title'), await card.locator('.market-product-name').textContent());
    assert.equal(await page.locator('.market-dialog-visual img').getAttribute('src'), await card.locator('img').getAttribute('src'));
    assert.equal(await page.locator('.market-dialog del').isVisible(), !!original);
    assert.equal(await page.locator('.market-dialog-discount').isVisible(), !!discount);
    if (original) {
      assert.ok((await text(page, '.market-dialog del')).includes(original));
      assert.ok((await text(page, '.market-dialog-discount')).startsWith(discount));
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('market-dialog-open'));
  }
}));

test('market language switch preserves filters and translates an open dialog without losing its return focus', () => withPage(async page => {
  await marketSearch(page, 'térmica');
  await marketSelect(page, 'shop', '2');
  await page.locator('[data-language="en"]').click();
  assert.deepEqual(await marketIds(page), ['102']);
  assert.equal(await page.locator('#market-search').inputValue(), 'térmica');
  assert.equal(await page.locator('#market-shop').inputValue(), '2');
  assert.equal(await text(page, '.market-product-name'), 'Insulated bottle');
  assert.equal(await text(page, '[data-market-count]'), '1 product to explore');
  assert.equal(await page.locator('#market-search').getAttribute('placeholder'), 'Backpack, bottle, Sendero…');
  await marketCards(page).first().click();
  assert.equal(await text(page, '#market-dialog-title'), 'Insulated bottle');
  assert.match(await text(page, '[data-market-description]'), /750 ml steel bottle/);
  assert.match(await text(page, '[data-market-price]'), /ARS.*24,000/);
  // The page language control is inert while modal; emulate an external language change.
  await page.evaluate(() => setLanguage('es'));
  assert.equal(await text(page, '#market-dialog-title'), 'Botella térmica');
  assert.match(await text(page, '[data-market-close]'), /Cerrar/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.dataset.productId === '102');
  assert.deepEqual(await marketIds(page), ['102']);
}));

test('market starts in persisted English with all dynamic strings present', () => withPage(async page => {
  assert.equal(await text(page, '#market-demo-title'), 'Three shops. One place.');
  assert.match(await text(page, '.market-grid'), /Andina backpack.*Insulated bottle.*Fleece pullover.*Camping mug.*Wool beanie.*Weekend duffel/s);
  assert.doesNotMatch(await text(page, '.market-grid'), /undefined/);
  await marketSearch(page, ' CLOTHING ');
  assert.deepEqual(await marketIds(page), ['103', '105']);
}, {}, 'en'));

test('market without JavaScript is explicitly unavailable with disabled filters', () => withPage(async page => {
  assert.equal(await page.locator('.market-fallback').isVisible(), true);
  assert.equal(await page.locator('.market-results').isVisible(), false);
  for (const control of await page.locator('.market-filters input, .market-filters select, .market-filters button').all()) {
    assert.equal(await control.isEnabled(), false);
  }
  assert.equal(await page.locator('#market-product-dialog').isVisible(), false);
}, { javaScriptEnabled: false }));

test('a missing market script leaves a fallback and Report+ still works', () => withPage(async page => {
  assert.equal(await page.locator('.market-fallback').isVisible(), true);
  assert.equal(await page.locator('#market-search').isEnabled(), false);
  assert.equal(await page.locator('.market-results').isVisible(), false);
  await select(page, 'company', 'Faro Digital');
  assert.equal(await text(page, '[data-demo-total]'), '10 h 15 min');
}, {}, undefined, page => page.route('**/assets/js/market-demo.js', route => route.abort())));

for (const width of [1440, 980, 760, 390, 320]) {
  test(`market and product dialog fit ${width}px with usable controls`, () => withPage(async page => {
    await page.locator('.market-api summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const control of await page.locator('.market-filters input, .market-filters select, .market-filters button').all()) {
      const box = await control.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.height >= 44);
    }
    const output = process.env.PORTFOLIO_SCREENSHOTS && path.resolve(process.env.PORTFOLIO_SCREENSHOTS);
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      const section = page.locator('#demo-market');
      const box = await section.boundingBox();
      await page.setViewportSize({ width, height: Math.ceil(box.height) });
      await section.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY, behavior: 'instant' }));
      await page.screenshot({ path: path.join(output, `market-${width}.png`) });
      await page.setViewportSize({ width, height: 844 });
    }
    await marketCards(page).first().click();
    const dialog = page.locator('#market-product-dialog');
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    assert.ok((await page.locator('[data-market-close]').boundingBox()).height >= 44);
    await page.locator('.market-dialog-note').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.market-dialog-note').isVisible(), true);
    if (output) {
      await dialog.evaluate(node => node.scrollTop = 0);
      await page.screenshot({ path: path.join(output, `market-dialog-${width}.png`) });
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('market-dialog-open'));
  }, { viewport: { width, height: 844 } }, width === 320 ? 'en' : undefined));
}

test('market reveals on scroll and respects a switch to reduced motion', () => withPage(async page => {
  await page.locator('#demo-market').evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForFunction(() => {
    const demo = document.getElementById('demo-market');
    return getComputedStyle(demo).opacity === '1' && demo.getAnimations().length === 0;
  });
  await marketSearch(page, 'mochila');
  assert.deepEqual(await marketIds(page), ['101']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The portfolio's global reduced-motion rule caps transitions at 0.01 ms.
  const durations = await marketCards(page).first().evaluate(node => getComputedStyle(node).transitionDuration.split(',').map(parseFloat));
  assert.ok(durations.every(seconds => seconds <= 0.00001));
  await marketCards(page).first().click();
  assert.equal(await page.locator('#market-product-dialog').isVisible(), true);
}, { reducedMotion: 'no-preference' }));
