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
  assert.match(await text(page, '[role="status"]'), /4 registros encontrados/);
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
