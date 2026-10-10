// みんなで同じ画面（yorozu-plans ROADMAP 7.36.2 K146、企画書 83）: 部屋へ送るものが番号の列と「ビンゴ」だけ・参加のページは検索に出さない・
// 1 人用の遊び方は部屋が無ければ変わらない。2 つのブラウザで番号がそろうことは本番に対する Playwright（yorozu-plans の BUILDLOG）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const { Room } = require('../room.js');

test('部屋コード: 全角・小文字・空白を直して 4 桁＋1 文字（I・L・O なし）だけ通す', () => {
  assert.equal(Room.normalizeCode(' １２３４ｋ '), '1234K');
  assert.equal(Room.normalizeCode('1234-k'), '1234K');
  assert.equal(Room.normalizeCode('1234I'), '');
  assert.equal(Room.normalizeCode('123K'), '');
  assert.equal(Room.normalizeCode(null), '');
  assert.equal(Room.joinUrl('1234K', 'ja'), 'https://yorozu-craft.com/bingo/join/?r=1234K');
  assert.equal(Room.joinUrl('1234K', 'en'), 'https://yorozu-craft.com/bingo/en/join/?r=1234K');
});

test('送るもの: 司会は番号の列（set）、参加者は「ビンゴ」（bingo）、どちらも hello だけ。名前・カード・端末の情報は送らない', () => {
  const sent = (f) => [...strip(read(f)).matchAll(/send\(\{([^}]*)\}\)/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.deepEqual(sent('room.js'), ["t: 'hello'", "t: 'hello'"]);
  assert.deepEqual(sent('main.js'), ["t: 'set', numbers: g().drawn"]);
  assert.deepEqual(sent('join.js'), ["t: 'bingo'"]);
  for (const f of ['room.js', 'join.js', 'main.js']) assert.doesNotMatch(strip(read(f)), /userAgent|navigator\.language|seed\s*:\s*me|card\s*:/, f);
  // 部屋を作るときに送るのは数の範囲（max）だけ
  assert.match(strip(read('room.js')), /body: JSON\.stringify\(\{ max: max \}\)/);
});

test('参加のページ（日英）: noindex で sitemap に無く、カードは calc.js で作る。プライバシーポリシーへのリンク', () => {
  const sitemap = read('sitemap.xml');
  for (const [f, pp] of [['join/index.html', '../../privacy-policy.html'], ['en/join/index.html', '../../../en/privacy-policy.html']]) {
    const html = read(f);
    assert.match(html, /<meta name="robots" content="noindex">/, f);
    assert.ok(!sitemap.includes(f.replace('index.html', '')), f);
    for (const s of ['text.js', 'calc.js', 'room.js', 'join.js']) assert.match(html, new RegExp(`src="[./]*${s.replace('.', '\\.')}"`), f + ' ' + s);
    assert.ok(html.includes(`href="${pp}"`), f);
  }
  assert.match(read('join.js'), /C\.genCardSet\(me\.seed, me\.max, 1\)\[0\]/);
});

test('1 人用の遊び方はそのまま: 部屋が無いときは「みんなで」の欄だけで、送るのは部屋をつないだ後（conn が無ければ何もしない）', () => {
  const main = strip(read('main.js'));
  assert.match(main, /function pushNumbers\(\) \{\s*if \(!conn \|\| anim\) return;/);
  assert.match(main, /if \(room && room\.expiresAt > Date\.now\(\)\) openRoom\(\);/);
  for (const f of ['index.html', 'en/index.html']) {
    const html = read(f);
    assert.match(html, /<div id="room-on" class="room-on" hidden>/, f);
    assert.match(html, /<p id="room-badge" class="room-badge" hidden><\/p>/, f);
    assert.ok(html.indexOf('room.js') < html.indexOf('main.js'), f);
  }
  // QR の部品は部屋を作ったときにだけ読む（最初の読み込みに入れない）
  for (const f of ['index.html', 'en/index.html']) assert.ok(!read(f).includes('qrcode.js'), f);
  assert.match(read('vendor/qrcode.js'), /Licensed under the MIT license/);
});
