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
  for (const f of ['main.js', 'cards.js', 'common.js', 'calc.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
    const strings = src.match(/'[^'\n]*'|"[^"\n]*"/g) || [];
    const ja = strings.filter((s) => /[぀-ヿ一-鿿]/.test(s));
    assert.deepEqual(ja, [], f);
  }
});
