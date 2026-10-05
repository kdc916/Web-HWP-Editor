import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const channel = process.env.BROWSER_CHANNEL || 'chrome';
const server = await serve('docs', 0);
const browser = await chromium.launch({ channel, headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], measurements = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
const url = 'http://127.0.0.1:' + server.address().port + '/Web-HWP-Editor/';
async function ready() {
  await page.locator('#newButton').click();
  await page.waitForFunction(() => !document.querySelector('#saveButton').disabled);
}
async function measure() {
  return page.evaluate(() => {
    const box = document.querySelector('#dropZone').getBoundingClientRect();
    const footer = document.querySelector('.status-bar').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, editorHeight: box.height, bottom: box.bottom,
      footerTop: footer.top, overflow: document.documentElement.scrollWidth > innerWidth };
  });
}
try {
  await page.goto(url); await ready();
  assert.equal(await page.locator('#quickRibbon').isVisible(), false);
  assert.equal(await page.locator('#ribbonToggleButton').getAttribute('aria-expanded'), 'false');
  const collapsed = await measure();
  await page.locator('#ribbonToggleButton').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#quickRibbon').isVisible(), true);
  assert.ok((await measure()).editorHeight < collapsed.editorHeight);
  const labels = await page.locator('.ribbon-label').evaluateAll(es => es.map(e => ({
    transform: getComputedStyle(e).transform, writing: getComputedStyle(e).writingMode
  })));
  assert.ok(labels.every(x => x.transform === 'none' && x.writing === 'horizontal-tb'));
  assert.equal(await page.locator('#ribbonNewButton,#ribbonOpenButton').count(), 0);
  await page.reload(); await ready();
  assert.equal(await page.locator('#quickRibbon').isVisible(), true);
  await page.locator('#studioChromeButton').click();
  await page.waitForFunction(() => document.querySelector('#studioChromeButton').textContent.includes('보기'));
  await page.locator('#ribbonToggleButton').click();
  await page.locator('#ribbonToggleButton').click();
  await page.locator('#studioChromeButton').click();
  await page.waitForFunction(() => document.querySelector('#studioChromeButton').textContent.includes('숨기기'));
  await page.locator('#ribbonToggleButton').click();
  await page.reload(); await ready();
  assert.equal(await page.locator('#quickRibbon').isVisible(), false);
  for (const [width,height] of [[1920,1080],[1536,864],[1366,768],[1024,600],[768,1024],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});
    for (const expanded of [false,true]) {
      if (await page.locator('#quickRibbon').isVisible() !== expanded) await page.locator('#ribbonToggleButton').click();
      const m = await measure(); measurements.push({...m,expanded});
      assert.equal(m.overflow,false,JSON.stringify(m));
      assert.ok(m.bottom <= m.footerTop + 1,JSON.stringify(m));
      assert.ok(m.editorHeight >= height * .6,JSON.stringify(m));
    }
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('#ribbonToggleButton').click();
  mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/responsive-'+channel+'.png'});
  // Restricted storage must not break initial load or the toggle.
  const restricted = await browser.newPage();
  await restricted.addInitScript(() => {
    Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}});
  });
  restricted.on('pageerror',e=>errors.push(e.message));
  await restricted.goto(url); await restricted.locator('#newButton').click();
  await restricted.waitForFunction(()=>!document.querySelector('#saveButton').disabled);
  await restricted.locator('#ribbonToggleButton').click();
  assert.equal(await restricted.locator('#quickRibbon').isVisible(),true);
  assert.deepEqual(errors,[]);
  writeFileSync('test-results/responsive-'+channel+'.json',JSON.stringify({channel,measurements,errors},null,2));
  console.log('PASS responsive layout, keyboard toggle, persisted on/off, independent editor menus, blocked storage',JSON.stringify(measurements));
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
