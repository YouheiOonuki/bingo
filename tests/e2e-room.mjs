// みんなで同じ画面（K146）の本番での確かめ: 司会の画面と参加の画面（別のブラウザ）で、同じ部屋の番号が 3 秒以内にそろう。
// node --test では動かない（本番と Playwright が要る）。yorozu-plans ROADMAP 7.36.2 の受け入れ。
//   npm i --no-save playwright && node tests/e2e-room.mjs [--base=https://yorozu-craft.com/bingo/]
// 終わったら部屋を閉じる（部屋の数の上限を使い切らない）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=https://yorozu-craft.com/bingo/').slice(7);
const LIMIT_MS = 3000;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const fail = (m) => { console.error('NG: ' + m); process.exitCode = 1; };
try {
  // 2 つのブラウザ（別々の文脈 = 別の localStorage・別のつながり）
  const hostCtx = await browser.newContext();
  const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostCtx.newPage();
  host.on('dialog', (d) => d.accept());
  await host.goto(BASE);
  await host.click('#room > summary'); // 「みんなで」は折りたたみの中
  await host.click('#room-create');
  await host.waitForSelector('#room-on:not([hidden])', { timeout: 10000 });
  const code = (await host.textContent('#room-code')).trim();
  const url = await host.getAttribute('#room-url', 'href');
  const qr = await host.waitForSelector('#room-qr svg', { timeout: 10000 }).catch(() => null);
  console.log('部屋', code, url, 'QR', qr ? 'あり' : 'なし');
  if (!qr) fail('QR が出ない');

  const player = await playerCtx.newPage();
  await player.goto(url);
  await player.waitForSelector('#play:not([hidden])', { timeout: 10000 });
  await host.waitForFunction(() => /1 人|: 1 /.test(document.getElementById('room-live').textContent), null, { timeout: 5000 });

  const times = [];
  for (let i = 0; i < 5; i++) {
    await host.click('#btn-draw');
    await host.click('#btn-draw').catch(() => {}); // 演出の途中なら、すぐ出す
    await host.waitForFunction(() => !document.getElementById('ball').classList.contains('spinning'));
    const t0 = Date.now();
    const want = await host.evaluate(() => JSON.parse(localStorage.getItem('bingo_game')).drawn);
    const last = String(want[want.length - 1]);
    await player.waitForFunction((n) => document.getElementById('last').textContent.trim().endsWith(n), last, { timeout: LIMIT_MS + 2000 });
    times.push(Date.now() - t0);
    const marked = await player.$$eval('#card td.hit', (tds) => tds.map((t) => t.textContent));
    const onCard = await player.$$eval('#card td', (tds) => tds.map((t) => t.textContent));
    const expectHit = onCard.filter((x) => x === 'FREE' || want.map(String).includes(x));
    if (JSON.stringify(marked.sort()) !== JSON.stringify(expectHit.sort())) fail('カードの印が出た数と合わない');
  }
  console.log('そろうまで（ms）', times.join(' '));
  if (Math.max(...times) > LIMIT_MS) fail('3 秒を超えた');

  // 1 つ取り消すと、参加の画面からも消える
  await host.click('#btn-undo');
  const after = await host.evaluate(() => JSON.parse(localStorage.getItem('bingo_game')).drawn);
  await player.waitForFunction((n) => document.getElementById('count').textContent.trim().startsWith(String(n)), after.length, { timeout: LIMIT_MS });
  console.log('取り消し: 参加の画面も', after.length, '個');

  // 再読み込みしても同じカード
  const before = await player.$$eval('#card td', (tds) => tds.map((t) => t.textContent).join(','));
  await player.reload();
  await player.waitForSelector('#play:not([hidden])');
  const again = await player.$$eval('#card td', (tds) => tds.map((t) => t.textContent).join(','));
  if (before !== again) fail('再読み込みでカードが変わった');

  // 閉じると参加の画面に「閉じました」
  await host.click('#room-close');
  const t1 = Date.now();
  await player.waitForFunction(() => /閉じ|closed/.test(document.getElementById('conn').textContent), null, { timeout: 20000 }).catch(() => fail('閉じたことが参加の画面に出ない'));
  console.log('閉じてから参加の画面に出るまで（ms）', Date.now() - t1);
  console.log('閉じた後の参加の画面:', await player.textContent('#conn'));
  if (!process.exitCode) console.log('OK');
} finally {
  await browser.close();
}
