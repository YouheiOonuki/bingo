// 画面の文（text.js）のテスト: node --test tests/*.test.js
// JS から出す文はすべて text.js に集めてある（英語版などを足しやすくするため）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../text.js');

test('読み上げ: 言語・列の文字の読みがある', () => {
  assert.equal(T.speech.lang, 'ja-JP');
  for (const L of ['B', 'I', 'N', 'G', 'O']) assert.ok(T.speech.letters[L], L);
  assert.equal(T.speech.one(12, 'B'), 'ビーの、12');
  assert.equal(T.speech.one(120, ''), '120番');
});

test('バックアップの失敗の理由（calc.js の code）すべてに文がある', () => {
  for (const code of ['unreadable', 'otherTool', 'newer', 'format', 'missing']) assert.ok(T.backupError[code], code);
  assert.match(T.backupError.otherTool('other-tool'), /other-tool/);
});

test('カード番号の読み取りの失敗（calc.js の reason）すべてに文がある', () => {
  for (const r of ['empty', 'format', 'otherSet', 'range']) assert.ok(T.checkReason[r], r);
  assert.match(T.checkReason.range(120), /120/);
});

test('JS のファイルに、画面に出す日本語の文を直接書いていない（コメントを除く）', () => {
  for (const f of ['main.js', 'cards.js', 'common.js', 'calc.js', 'screen.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    const strings = src.match(/'[^'\n]*'|"[^"\n]*"/g) || [];
    const ja = strings.filter((s) => /[　-ヿ一-鿿＀-￯]/.test(s));   // かな・漢字に加えて全角の記号（〜・（）・全角スペース）も
    assert.deepEqual(ja, [], f);
  }
});

test('英語（en）: 日本語と同じ項目がそろい、日本語の文字を含まない', () => {
  const { ja, en } = T.all;
  const keys = (o, pre = '') => Object.keys(o).filter((k) => k !== 'all').flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], pre + k + '.') : [pre + k]));
  assert.deepEqual(keys(en).sort(), keys(ja).sort());
  const JA = /[　-ヿ一-鿿＀-￯]/;
  const sample = { count: 20, max: 75, seed: 'KR7M2X', tag: 'KR', title: '', credit: true, paper: 'letter' };
  for (const k of keys(en)) {
    const v = k.split('.').reduce((o, x) => o[x], en);
    let out;
    try { out = typeof v === 'function' ? String(v.call(en, sample.count, 3, 2, 'letter')) : String(v); } catch { continue; }   // 引数の形がちがうものは下で
    assert.ok(!JA.test(out), k + ': ' + out);
  }
  for (const f of ['announce', 'recent']) assert.ok(!JA.test(en[f](['B 1', 'O 75'])), f);
  for (const f of ['estimate', 'summary', 'optCards', 'cardsSummary', 'sharedBanner']) {
    const arg = f === 'estimate' ? { prizes: 3, people: 20, p10: 20, median: 30, p90: 40, rows: [{ per: 1, times: 30 }], sec: 15, current: 1, fromSet: true }
      : f === 'summary' ? { date: 'Sep 24, 2026', count: 3, range: '1–75', prizes: [{ name: 'Mug', winner: 'No.KR-001' }], order: ['B 1'] } : sample;
    const out = [].concat(en[f](arg)).join('\n');
    assert.ok(!JA.test(out), f + ': ' + out);
  }
});

test('英語の読み上げ: en-US・"B 12" の形・既定で列の文字を言う（日本語は数だけ）', () => {
  const { ja, en } = T.all;
  assert.equal(en.speech.lang, 'en-US');
  assert.equal(en.speech.one(12, 'B'), 'B 12');
  assert.equal(en.speech.one(120, ''), '120');
  assert.equal([12, 52].map((n, i) => en.speech.one(n, ['B', 'G'][i])).join(en.speech.join), 'B 12, G 52');
  assert.equal(en.speech.sayLetter, true);
  assert.equal(ja.speech.sayLetter, false);
});

test('用紙: 既定は日本語 A4・英語 Letter。枚数の文に用紙の名前が入る', () => {
  const { ja, en } = T.all;
  assert.equal(ja.paperDefault, 'a4');
  assert.equal(en.paperDefault, 'letter');
  assert.equal(en.sheetInfo(40, 10, 4, 'letter'), '40 cards · 10 Letter pages (4 per page)');
  assert.equal(ja.sheetInfo(40, 10, 4, 'a4'), '40 枚・A4 10 ページ（1 ページに 4 枚）');
  assert.equal(en.cardCredit, 'Made at yorozu-craft.com/bingo/en/print/');
});
