/**
 * Tests gestuels, au toucher reel.
 *
 * Ces gestes ne sont pas verifiables autrement : `touch-action` n'agit que sur
 * de vraies entrees tactiles passees par le compositeur, jamais sur des
 * evenements souris ni sur des evenements synthetiques. Une regression ici est
 * invisible aux tests unitaires et ne se decouvre que sur un telephone.
 *
 *   node tests/gestures.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:4173/TGVMaxWatch/';
const VIEWPORT = { width: 393, height: 851 };

// PLAYWRIGHT_CHROMIUM_PATH permet de pointer un binaire deja present plutot
// que de le retelecharger.
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
});

const page = await context.newPage();
const jsErrors = [];
page.on('pageerror', (error) => jsErrors.push(error.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const cdp = await context.newCDPSession(page);

/** Geste tactile reel : soumis a `touch-action`, contrairement a la souris. */
async function swipe(from, to, steps = 14) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
    });
    await page.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const activeDir = () =>
  page.$eval('[class*="option"][data-active="true"]', (el) => el.textContent.trim());

// Glissement horizontal sur le calendrier : changement de sens.
const before = await activeDir();
await swipe({ x: 300, y: 420 }, { x: 70, y: 425 });
await page.waitForTimeout(400);
check('glissement de sens', before !== (await activeDir()), before);

// Le curseur suit le doigt en continu, il ne bascule pas a la fin du geste.
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 422 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 424 }] });
const midDrag = await page.$eval('[class*="thumb"]', (el) => getComputedStyle(el).transform);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
check('suivi 1:1 du curseur', midDrag !== 'none' && !/1, 0, 0, 1, 0, 0/.test(midDrag), midDrag);

// Ouverture d'un jour. Les deux panneaux coexistent : viser le visible.
const label = await page.evaluate(() => {
  for (const cell of document.querySelectorAll('button[aria-label]')) {
    const rect = cell.getBoundingClientRect();
    if (rect.left >= 0 && rect.right <= innerWidth && rect.width > 0) {
      return cell.getAttribute('aria-label');
    }
  }
  return null;
});
await page.locator(`button[aria-label="${label}"]`).click();
await page.waitForTimeout(500);
check('ouverture du detail', Boolean(label), label);

// Defilement de la liste des trains. `touch-action: none` sur un ancetre le
// bloquerait silencieusement et tronquerait la liste au premier ecran.
const body = page.locator('[role="dialog"] [class*="body"]');
const metrics = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
check('liste plus longue que l ecran', metrics.scroll > metrics.client, `${metrics.scroll} > ${metrics.client}`);

const box = await body.boundingBox();
await swipe(
  { x: 200, y: Math.min(box.y + box.height, VIEWPORT.height) - 30 },
  { x: 200, y: Math.max(box.y, 0) + 30 },
  16,
);
await page.waitForTimeout(400);
check('defilement de la liste', (await body.evaluate((el) => el.scrollTop)) > 0);

// Balayage d'une ligne. Viser dans l'intersection de la ligne et de la partie
// visible du conteneur : une ligne clippee a toujours un rect, mais le doigt
// pose la atterrit sur le calendrier.
const rowY = await page.evaluate(() => {
  const rect = document.querySelector('[role="dialog"] [class*="body"]').getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, innerHeight);

  for (const row of document.querySelectorAll('[class*="wrap"]')) {
    const box = row.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    if (mid > top + 20 && mid < bottom - 20) return mid;
  }
  return null;
});
await swipe({ x: 300, y: rowY }, { x: 180, y: rowY }, 12);
await page.waitForTimeout(300);
const watched = await page.locator('[class*="watched"]').count();
// Exactement la ligne balayee : une fenetre ouverte marquerait toute la journee.
check('balayage « surveiller »', watched === 1, `${watched} ligne(s)`);

// Sheet tiree vers le haut jusqu'a l'ancrage plein.
const sheet = page.locator('[role="dialog"]');
const topBefore = await sheet.evaluate((el) => el.getBoundingClientRect().top);
const grip = await page.locator('[role="dialog"] [class*="grip"]').boundingBox();
await swipe({ x: 196, y: grip.y + 8 }, { x: 196, y: grip.y - 260 }, 14);
await page.waitForTimeout(500);
const topAfter = await sheet.evaluate((el) => el.getBoundingClientRect().top);
check('sheet tiree vers le haut', topAfter < topBefore - 100, `${Math.round(topBefore)} -> ${Math.round(topAfter)}`);

check('aucune erreur JS', jsErrors.length === 0, jsErrors.join(' | '));

await browser.close();
process.exit(failures === 0 ? 0 : 1);
