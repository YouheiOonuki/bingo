// ビンゴのロジックのテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const seq = (arr) => { let i = 0; return () => arr[i++ % arr.length]; };

test('乱数: 同じ key なら同じ並び、ちがう key ならちがう並び', () => {
  const a = C.makeRng('x').shuffle([...Array(20).keys()]);
  const b = C.makeRng('x').shuffle([...Array(20).keys()]);
  const c = C.makeRng('y').shuffle([...Array(20).keys()]);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(20).keys()]);
});

test('seed: 6 文字・読み違えやすい字（0 1 I O）を使わない・全角や小文字も読める', () => {
  for (let i = 0; i < 200; i++) {
    const s = C.newSeed(Math.random);
    assert.match(s, /^[2-9A-HJ-NP-Z]{6}$/);
    assert.equal(C.normalizeSeed(s), s);
  }
  assert.equal(C.normalizeSeed('ｋｒ７ｍ２ｘ'), 'KR7M2X');
  assert.equal(C.normalizeSeed('kr7-m2x'), 'KR7M2X');
  assert.equal(C.normalizeSeed('KR7M2'), null);
  assert.equal(C.normalizeSeed('KR7M2O'), null);   // O は使わない
  assert.equal(C.normalizeSeed(123456), null);
});

test('カード: 列の範囲（75 なら B1-15 I16-30 N31-45 G46-60 O61-75）・カード内で重ならない・中央 FREE', () => {
  for (const max of C.CARD_MAXES) {
    const per = max / 5;
    const cards = C.genCardSet('AB2CD3', max, 200);
    cards.forEach((card) => {
      assert.equal(card.length, 25);
      assert.equal(card[C.FREE], 0);
      const nums = card.filter((n, i) => i !== C.FREE);
      assert.equal(new Set(nums).size, 24, 'カードの中で重ならない');
      card.forEach((n, i) => {
        if (i === C.FREE) return;
        const col = i % 5;
        assert.ok(n >= col * per + 1 && n <= (col + 1) * per, `max ${max} 列 ${col} に ${n}`);
      });
    });
  }
  assert.deepEqual(C.columnRanges(75).map((r) => [r.lo, r.hi]), [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]]);
});

test('カード: 組の中で同じカードがない（200 枚 × いくつかの seed）', () => {
  for (const seed of ['AB2CD3', 'ZZZZZZ', '222222', 'KR7M2X']) {
    for (const max of C.CARD_MAXES) {
      const keys = C.genCardSet(seed, max, 200).map((c) => c.join(','));
      assert.equal(new Set(keys).size, 200);
    }
  }
});

test('カード: 同じ seed・範囲ならいつでも同じ。枚数を増やしても前のカードは変わらない', () => {
  const a = C.genCardSet('KR7M2X', 75, 40);
  const b = C.genCardSet('KR7M2X', 75, 120);
  assert.deepEqual(b.slice(0, 40), a);
  assert.notDeepEqual(C.genCardSet('KR7M2Y', 75, 1), a.slice(0, 1));
  assert.notDeepEqual(C.genCardSet('KR7M2X', 90, 1), a.slice(0, 1));
});

test('カード番号: 組の目印 2 文字＋3 桁。いろいろな書き方で読める', () => {
  const seed = 'KR7M2X', max = 75, count = 120;
  const tag = C.setTag(seed, max);
  assert.match(tag, /^[A-HJ-NP-Z]{2}$/);
  assert.equal(C.cardId(seed, max, 0), tag + '-001');
  assert.equal(C.cardId(seed, max, 119), tag + '-120');
  for (let i = 0; i < count; i++) {
    const id = C.cardId(seed, max, i);
    assert.deepEqual(C.parseCardId(id, seed, max, count), { ok: true, index: i });
  }
  const ok = (t, i) => assert.deepEqual(C.parseCardId(t, seed, max, count), { ok: true, index: i }, t);
  ok('42', 41);
  ok('042', 41);
  ok('No.42', 41);
  ok('ｎｏ．４２', 41);
  ok(tag.toLowerCase() + '042', 41);
  ok(tag + ' - 042', 41);
  ok('  ' + tag + '－０４２ ', 41);
  const ng = (t, reason) => assert.equal(C.parseCardId(t, seed, max, count).reason, reason, t);
  ng('', 'empty');
  ng('   ', 'empty');
  ng('0', 'range');
  ng('121', 'range');
  ng('abc', 'format');
  ng('1234', 'format');
  const other = tag === 'ZZ' ? 'ZY' : 'ZZ';
  ng(other + '-001', 'otherSet');
});

test('カード番号: 範囲や seed がちがうと組の目印もたいていちがう', () => {
  const tags = new Set();
  for (let i = 0; i < 100; i++) tags.add(C.setTag(C.newSeed(Math.random), 75));
  assert.ok(tags.size > 60, `目印の種類 ${tags.size}`);
});

test('当たりの判定: 線がそろえばビンゴ、4 つならリーチ、FREE を使う', () => {
  // 1 行目 [1,16,31,46,61]、中央の列 N は FREE を含む
  const card = [
    1, 16, 31, 46, 61,
    2, 17, 32, 47, 62,
    3, 18, 0, 48, 63,
    4, 19, 34, 49, 64,
    5, 20, 35, 50, 65,
  ];
  let r = C.checkCard(card, []);
  assert.equal(r.bingo, false);
  assert.equal(r.reach, 0);
  assert.equal(r.marked.filter(Boolean).length, 1);

  r = C.checkCard(card, [1, 16, 31, 46]);
  assert.equal(r.bingo, false);
  assert.equal(r.reach, 1);

  r = C.checkCard(card, [70, 1, 16, 31, 46, 61, 9]);
  assert.equal(r.bingo, true);
  assert.deepEqual(r.lines, [0]);
  assert.equal(r.bingoAt, 6);
  assert.equal(r.bingoNumber, 61);

  // 斜め: 1, 17, FREE, 49, 65
  r = C.checkCard(card, [65, 1, 49, 17]);
  assert.equal(r.bingo, true);
  assert.deepEqual(r.lines, [10]);
  assert.equal(r.bingoAt, 4);
  assert.equal(r.bingoNumber, 17);

  // 中央の列: 31, 32, FREE, 34, 35 → 4 つでビンゴ
  r = C.checkCard(card, [31, 32, 34]);
  assert.equal(r.bingo, false);
  assert.equal(r.reach, 1);
  r = C.checkCard(card, [31, 32, 34, 35]);
  assert.equal(r.bingo, true);
  assert.deepEqual(r.lines, [7]);

  // 先にそろった線の番目が答えになる（2 本目の線はあとから）
  r = C.checkCard(card, [2, 17, 32, 47, 62, 1, 16, 31, 46, 61]);
  assert.deepEqual(r.lines, [0, 1]);
  assert.equal(r.bingoAt, 5);
  assert.equal(r.bingoNumber, 62);
});

test('当たりの判定: 75 個全部出ればどのカードもビンゴ（12 本すべて）', () => {
  const all = C.remaining(1, 75, []);
  C.genCardSet('AB2CD3', 75, 30).forEach((card) => {
    const r = C.checkCard(card, all);
    assert.equal(r.lines.length, 12);
    assert.ok(r.bingoAt >= 4 && r.bingoAt <= 75);
  });
});

test('組の状況: ビンゴとリーチの枚数', () => {
  const cards = C.genCardSet('AB2CD3', 75, 50);
  assert.deepEqual(C.setStatus(cards, []), { bingo: 0, reach: 0, total: 50 });
  const drawn = [];
  const rnd = C.mulberry32(7);
  let prev = 0;
  while (drawn.length < 75) {
    const r = C.drawNumbers(1, 75, drawn, 1, rnd);
    drawn.push(r.picked[0]);
    const s = C.setStatus(cards, drawn);
    assert.ok(s.bingo >= prev, 'ビンゴの枚数は減らない');
    assert.ok(s.bingo + s.reach <= 50);
    prev = s.bingo;
  }
  assert.equal(prev, 50);
});

test('抽選: 重ならずに全部出る（1〜75、1 個ずつ・3 個ずつ）', () => {
  for (const k of [1, 3]) {
    let drawn = [];
    const rnd = C.mulberry32(k);
    let steps = 0;
    while (drawn.length < 75) {
      const r = C.drawNumbers(1, 75, drawn, k, rnd);
      assert.ok(r.picked.length >= 1 && r.picked.length <= k);
      drawn = r.drawn;
      steps++;
    }
    assert.equal(new Set(drawn).size, 75);
    assert.deepEqual([...drawn].sort((a, b) => a - b), C.remaining(1, 75, []));
    assert.equal(steps, Math.ceil(75 / k));
    assert.deepEqual(C.drawNumbers(1, 75, drawn, 1, rnd), { drawn, picked: [] });
  }
});

test('抽選: 元の配列を変えない・範囲の外は出ない・rand が 1 に近くても範囲内', () => {
  const drawn = [5, 7];
  const r = C.drawNumbers(5, 10, drawn, 2, seq([0.9999999999, 0]));
  assert.deepEqual(drawn, [5, 7]);
  assert.deepEqual(r.picked, [10, 6]);
  assert.deepEqual(r.drawn, [5, 7, 10, 6]);
});

test('抽選: おおむね偏りがない（1〜10 を 20,000 回の最初の 1 個）', () => {
  const counts = Array(11).fill(0);
  const rnd = C.mulberry32(42);
  for (let i = 0; i < 20000; i++) counts[C.drawNumbers(1, 10, [], 1, rnd).picked[0]]++;
  counts.slice(1).forEach((c) => assert.ok(c > 1800 && c < 2200, String(c)));
});

test('取り消し: 最後の 1 個だけ消える。空なら何もしない', () => {
  assert.deepEqual(C.undoLast([3, 9, 12]), { drawn: [3, 9], removed: 12 });
  assert.deepEqual(C.undoLast([]), { drawn: [], removed: null });
  const a = [1, 2];
  C.undoLast(a);
  assert.deepEqual(a, [1, 2]);
});

test('列の文字: 1〜75 などカードの範囲のときだけ', () => {
  assert.equal(C.letterOf(1, 1, 75), 'B');
  assert.equal(C.letterOf(15, 1, 75), 'B');
  assert.equal(C.letterOf(16, 1, 75), 'I');
  assert.equal(C.letterOf(45, 1, 75), 'N');
  assert.equal(C.letterOf(60, 1, 75), 'G');
  assert.equal(C.letterOf(75, 1, 75), 'O');
  assert.equal(C.letterOf(10, 1, 50), 'B');
  assert.equal(C.letterOf(11, 1, 50), 'I');
  assert.equal(C.letterOf(100, 1, 100), 'O');
  assert.equal(C.letterOf(5, 1, 60), '');
  assert.equal(C.letterOf(5, 2, 75), '');
});

test('時間の目安: 景品が多いほど引く数が増える・人数が多いほど早くビンゴが出る', () => {
  const rnd = C.mulberry32(3);
  const cards50 = C.genCardSet('AB2CD3', 75, 50);
  const one = C.simulateDraws(cards50, 75, 1, 300, rnd);
  const ten = C.simulateDraws(cards50, 75, 10, 300, rnd);
  const all = C.simulateDraws(cards50, 75, 50, 300, rnd);
  assert.ok(one.p10 <= one.median && one.median <= one.p90);
  assert.ok(one.median < ten.median && ten.median < all.median, `${one.median} ${ten.median} ${all.median}`);
  assert.ok(one.median >= 4 && all.median <= 75);
  const cards200 = C.genCardSet('AB2CD3', 75, 200);
  assert.ok(C.simulateDraws(cards200, 75, 10, 300, rnd).median < ten.median);
  // 景品が人数より多いときは全員まで
  assert.equal(C.simulateDraws(cards50.slice(0, 3), 75, 99, 50, rnd).median <= 75, true);
});

test('正規化: 抽選の状態', () => {
  assert.deepEqual(C.normalizeGame(null), { min: 1, max: 75, per: 1, drawn: [] });
  assert.deepEqual(C.normalizeGame({ min: 1, max: 75, per: 2, drawn: [3, 3, 80, 'x', 7.5, 70, -1] }), { min: 1, max: 75, per: 2, drawn: [3, 70] });
  assert.deepEqual(C.normalizeGame({ min: 10, max: 5 }), { min: 10, max: 75, per: 1, drawn: [] });
  assert.deepEqual(C.normalizeGame({ min: 1, max: 5000, per: 9 }), { min: 1, max: 75, per: 1, drawn: [] });
  assert.deepEqual(C.normalizeGame({ min: 100, max: 999, drawn: [150] }).drawn, [150]);
});

test('正規化: カードの設定・景品・画面の設定', () => {
  assert.deepEqual(C.normalizeCards({ seed: 'kr7m2x', max: 90, count: 500, perPage: 3, title: 'x'.repeat(50), credit: false }),
    { seed: 'KR7M2X', max: 90, count: 40, perPage: 4, title: 'x'.repeat(30), credit: false });
  assert.deepEqual(C.normalizeCards({}), { seed: null, max: 75, count: 40, perPage: 4, title: '', credit: true });
  assert.equal(C.normalizeCards({ seed: 'bad' }, 'AAAAAA').seed, 'AAAAAA');
  assert.equal(C.normalizeCards({ count: 200 }).count, 200);
  assert.deepEqual(C.normalizePrizes([{ name: '1等', winner: 'No.AB-001' }, null, { name: 3 }, 'x']),
    [{ name: '1等', winner: 'No.AB-001' }, { name: '', winner: '' }, { name: '', winner: '' }, { name: '', winner: '' }]);
  assert.equal(C.normalizePrizes(Array(150).fill({ name: 'a' })).length, 100);
  assert.deepEqual(C.normalizePrizes('x'), []);
  assert.deepEqual(C.normalizeSettings(undefined), { sound: true, voice: false, effect: 'normal' });
  assert.deepEqual(C.normalizeSettings({ sound: false, voice: true, effect: 'off' }), { sound: false, voice: true, effect: 'off' });
  assert.equal(C.normalizeSettings({ effect: 'crazy' }).effect, 'normal');
});

test('共有リンク: カードの設定だけが往復する（日本語の見出しも）。同じカードが作れる', () => {
  const cards = { seed: 'KR7M2X', max: 90, count: 120, perPage: 2, title: '2026 忘年会🎉', credit: false };
  const hash = C.encodeShare(cards);
  assert.match(hash, /^#s=[A-Za-z0-9_-]+$/);
  const back = C.decodeShare(hash);
  assert.deepEqual(back, { seed: 'KR7M2X', max: 90, count: 120, perPage: 2, title: '2026 忘年会🎉' });
  assert.deepEqual(C.genCardSet(back.seed, back.max, back.count), C.genCardSet(cards.seed, cards.max, cards.count));
  assert.ok(!/drawn/.test(Buffer.from(hash.slice(3), 'base64url').toString()), '出た数は入れない');
});

test('共有リンク: 壊れたもの・形のちがうものは null', () => {
  for (const h of ['', '#', '#s=', '#s=!!!', '#x=abc', '#s=' + Buffer.from('{"v":1}').toString('base64url'),
    '#s=' + Buffer.from('{"v":2,"seed":"KR7M2X"}').toString('base64url'), '#s=' + Buffer.from('not json').toString('base64url'),
    '#s=' + Buffer.from([0xff, 0xfe]).toString('base64url')]) {
    assert.equal(C.decodeShare(h), null, h);
  }
  const weird = '#s=' + Buffer.from(JSON.stringify({ v: 1, seed: 'KR7M2X', max: 77, count: -3, perPage: 9, title: 5 })).toString('base64url');
  assert.deepEqual(C.decodeShare(weird), { seed: 'KR7M2X', max: 75, count: 40, perPage: 4, title: '' });
});
