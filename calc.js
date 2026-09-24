// ===========================
// 大人数ビンゴ抽選 — ロジック（画面から切り離した純粋関数）
// DOM や localStorage に触らない。画面に出す文はここに書かない（text.js。英語版を足しやすくするため）
// tests/*.test.js から node --test で確かめる
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // 乱数（seed が同じなら同じ並び。カードの再現に使う）
  // ---------------------------------------------------------------

  /** mulberry32。0 以上 1 未満を返す関数を作る */
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 文字列を 32bit の数にする（FNV-1a ＋ かき混ぜ） */
  function hashString(s) {
    var h = 0x811C9DC5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function makeRng(key) {
    var r = mulberry32(hashString(String(key)));
    return {
      next: r,
      shuffle: function (a) {
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(r() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
    };
  }

  // ---------------------------------------------------------------
  // カードの組の番号（seed）とカード番号（ID）
  // 読み違えやすい 0/O・1/I を使わない 32 文字
  // ---------------------------------------------------------------
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var SEED_LEN = 6;

  /** 新しい seed（rand は 0 以上 1 未満を返す関数。画面では crypto から作る） */
  function newSeed(rand) {
    var s = '';
    for (var i = 0; i < SEED_LEN; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
    return s;
  }

  /** 全角→半角、小文字→大文字 */
  function toHalf(s) {
    return String(s == null ? '' : s)
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[－ー―‐−]/g, '-')
      .toUpperCase();
  }

  /** seed の形を確かめる。正しくなければ null */
  function normalizeSeed(s) {
    if (typeof s !== 'string') return null;
    var t = toHalf(s).replace(/[^0-9A-Z]/g, '');
    if (t.length !== SEED_LEN) return null;
    for (var i = 0; i < t.length; i++) if (ALPHABET.indexOf(t[i]) < 0) return null;
    return t;
  }

  /** カードの組の目印（英字 2 文字）。印刷したカードと画面のカードの組が同じかを見分ける */
  var TAG_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function setTag(seed, max) {
    var h = hashString('tag:' + seed + ':' + max);
    return TAG_LETTERS[h % 24] + TAG_LETTERS[Math.floor(h / 24) % 24];
  }

  /** カード番号（例: KR-042）。index は 0 から */
  function cardId(seed, max, index) {
    return setTag(seed, max) + '-' + String(index + 1).padStart(3, '0');
  }

  /**
   * 入力されたカード番号を読む。「KR-042」「kr042」「42」「No.42」「４２」を受け付ける
   * @returns {{ok:true, index:number} | {ok:false, reason:'empty'|'format'|'otherSet'|'range'}}
   */
  function parseCardId(text, seed, max, count) {
    var t = toHalf(text).replace(/NO\.?/g, '').replace(/[\s#№.．]/g, '');
    if (!t) return { ok: false, reason: 'empty' };
    var m = /^([A-Z]{2})-?(\d{1,3})$/.exec(t);
    var num;
    if (m) {
      if (m[1] !== setTag(seed, max)) return { ok: false, reason: 'otherSet' };
      num = Number(m[2]);
    } else if (/^\d{1,3}$/.test(t)) {
      num = Number(t);
    } else {
      return { ok: false, reason: 'format' };
    }
    if (num < 1 || num > count) return { ok: false, reason: 'range' };
    return { ok: true, index: num - 1 };
  }

  // ---------------------------------------------------------------
  // カード（5×5、行ごとに左から。中央 index 12 は FREE で 0）
  // 列 B・I・N・G・O は、最大の数を 5 等分した範囲（75 なら 1〜15・16〜30 …）
  // ---------------------------------------------------------------
  var CARD_MAXES = [50, 75, 90, 100];
  var LETTERS = ['B', 'I', 'N', 'G', 'O'];
  var FREE = 12;

  /** 列の範囲 [{lo, hi}] × 5 */
  function columnRanges(max) {
    var per = max / 5;
    return LETTERS.map(function (_, c) { return { lo: c * per + 1, hi: (c + 1) * per }; });
  }

  /** 数の列の文字（B〜O）。1〜max でカード用の max のときだけ。それ以外は '' */
  function letterOf(n, min, max) {
    if (min !== 1 || CARD_MAXES.indexOf(max) < 0 || n < 1 || n > max) return '';
    return LETTERS[Math.floor((n - 1) / (max / 5))];
  }

  function genCardOnce(seed, max, index, attempt) {
    var rng = makeRng('card:' + seed + ':' + max + ':' + index + ':' + attempt);
    var cols = columnRanges(max).map(function (r) {
      var pool = [];
      for (var n = r.lo; n <= r.hi; n++) pool.push(n);
      return rng.shuffle(pool).slice(0, 5);
    });
    var cells = [];
    for (var row = 0; row < 5; row++) for (var c = 0; c < 5; c++) cells.push(cols[c][row]);
    cells[FREE] = 0;
    return cells;
  }

  /**
   * カードの組を作る。同じ seed・max なら、いつ・どの端末でも同じカード（枚数を増やしても前のカードは変わらない）
   * 組の中に同じカードが出たら（まず起きないが）そのカードだけ作り直す
   */
  function genCardSet(seed, max, count) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < count; i++) {
      var attempt = 0, card, key;
      do {
        card = genCardOnce(seed, max, i, attempt++);
        key = card.join(',');
      } while (seen[key]);
      seen[key] = true;
      out.push(card);
    }
    return out;
  }

  /** 横 5・縦 5・斜め 2 の 12 本 */
  var LINES = (function () {
    var l = [], r, c;
    for (r = 0; r < 5; r++) l.push([0, 1, 2, 3, 4].map(function (x) { return r * 5 + x; }));
    for (c = 0; c < 5; c++) l.push([0, 1, 2, 3, 4].map(function (x) { return x * 5 + c; }));
    l.push([0, 6, 12, 18, 24]);
    l.push([4, 8, 12, 16, 20]);
    return l;
  })();

  /**
   * カードの当たりを確かめる
   * @param {number[]} card 25 マス（中央は 0＝FREE）
   * @param {number[]} drawn 出た数（出た順）
   * @returns {{bingo:boolean, lines:number[], reach:number, marked:boolean[], bingoAt:number|null, bingoNumber:number|null}}
   *   lines: そろった線（LINES の番号）、reach: あと 1 つの線の数、
   *   bingoAt: 何個目の数で初めてそろったか（1 から）、bingoNumber: そのときの数
   */
  function checkCard(card, drawn) {
    var order = Object.create(null);
    for (var i = 0; i < drawn.length; i++) if (order[drawn[i]] === undefined) order[drawn[i]] = i;
    var marked = card.map(function (n, idx) { return idx === FREE || order[n] !== undefined; });
    var lines = [], reach = 0, first = null;
    LINES.forEach(function (line, li) {
      var hit = 0, last = -1;
      line.forEach(function (idx) {
        if (marked[idx]) {
          hit++;
          if (idx !== FREE && order[card[idx]] > last) last = order[card[idx]];
        }
      });
      if (hit === 5) {
        lines.push(li);
        if (first === null || last < first) first = last;
      } else if (hit === 4) {
        reach++;
      }
    });
    return {
      bingo: lines.length > 0,
      lines: lines,
      reach: reach,
      marked: marked,
      bingoAt: first === null ? null : first + 1,
      bingoNumber: first === null ? null : drawn[first],
    };
  }

  /** カードの組全体の状況（ビンゴの枚数・リーチの枚数。リーチはビンゴでないカードだけ数える） */
  function setStatus(cards, drawn) {
    var bingo = 0, reach = 0;
    cards.forEach(function (card) {
      var r = checkCard(card, drawn);
      if (r.bingo) bingo++;
      else if (r.reach > 0) reach++;
    });
    return { bingo: bingo, reach: reach, total: cards.length };
  }

  // ---------------------------------------------------------------
  // 抽選（出た数の並びだけを持つ。1 つ前に戻すのは最後の 1 個を消すだけ）
  // ---------------------------------------------------------------

  /** まだ出ていない数（小さい順） */
  function remaining(min, max, drawn) {
    var used = Object.create(null);
    drawn.forEach(function (n) { used[n] = true; });
    var out = [];
    for (var n = min; n <= max; n++) if (!used[n]) out.push(n);
    return out;
  }

  /**
   * 数を k 個引く（重ならない）
   * @param {function} rand 0 以上 1 未満を返す関数
   * @returns {{drawn:number[], picked:number[]}} 新しい出た数の並び（元の配列は変えない）と、今回出た数
   */
  function drawNumbers(min, max, drawn, k, rand) {
    var rest = remaining(min, max, drawn);
    var picked = [];
    for (var i = 0; i < k && rest.length; i++) {
      var j = Math.floor(rand() * rest.length);
      if (j >= rest.length) j = rest.length - 1;
      picked.push(rest.splice(j, 1)[0]);
    }
    return { drawn: drawn.concat(picked), picked: picked };
  }

  /** 最後の 1 個を取り消す */
  function undoLast(drawn) {
    return drawn.length
      ? { drawn: drawn.slice(0, -1), removed: drawn[drawn.length - 1] }
      : { drawn: drawn.slice(), removed: null };
  }

  // ---------------------------------------------------------------
  // 時間の目安: 景品の数だけのカードがビンゴになるまでに、数をいくつ引くか
  // （ためしに何回も抽選して数える。配ったカードが全部使われている前提）
  // ---------------------------------------------------------------

  /**
   * @param {number[][]} cards 配るカード
   * @param {number} max カードの最大の数
   * @param {number} prizes 景品の数（この枚数のカードがビンゴになるまで）
   * @param {number} runs ためす回数
   * @param {function} rand 0 以上 1 未満
   * @returns {{p10:number, median:number, p90:number}} 引く数の個数（10%・50%・90% の点）
   */
  function simulateDraws(cards, max, prizes, runs, rand) {
    var need = Math.max(1, Math.min(prizes, cards.length));
    var results = [];
    var order = new Array(max + 1);
    var seq = [];
    for (var n = 1; n <= max; n++) seq.push(n);
    for (var r = 0; r < runs; r++) {
      for (var i = seq.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = seq[i]; seq[i] = seq[j]; seq[j] = t; }
      for (var p = 0; p < seq.length; p++) order[seq[p]] = p;
      var at = cards.map(function (card) {
        var best = Infinity;
        for (var li = 0; li < LINES.length; li++) {
          var last = -1;
          for (var k = 0; k < 5; k++) {
            var idx = LINES[li][k];
            if (idx !== FREE && order[card[idx]] > last) last = order[card[idx]];
          }
          if (last < best) best = last;
        }
        return best + 1;
      }).sort(function (a, b) { return a - b; });
      results.push(at[need - 1]);
    }
    results.sort(function (a, b) { return a - b; });
    var q = function (x) { return results[Math.min(results.length - 1, Math.floor(x * results.length))]; };
    return { p10: q(0.1), median: q(0.5), p90: q(0.9) };
  }

  // ---------------------------------------------------------------
  // 保存するデータの正規化（保存データ・共有リンク・読み込んだファイルはそのまま信じない）
  // ---------------------------------------------------------------
  function intIn(v, lo, hi, def) {
    var n = Number(v);
    return v !== null && v !== '' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi ? n : def;
  }
  function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : ''; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  var LIMITS = { maxNumber: 999, maxCards: 200, maxPrizes: 100, titleLen: 30, prizeLen: 40, winnerLen: 30 };

  /** 抽選の状態 {min, max, per, drawn} */
  function normalizeGame(g) {
    g = obj(g);
    var min = intIn(g.min, 1, LIMITS.maxNumber - 1, 1);
    var max = intIn(g.max, min + 1, LIMITS.maxNumber, Math.max(75, min + 1));
    var seen = Object.create(null), drawn = [];
    (Array.isArray(g.drawn) ? g.drawn : []).forEach(function (n) {
      if (typeof n === 'number' && Math.floor(n) === n && n >= min && n <= max && !seen[n]) { seen[n] = true; drawn.push(n); }
    });
    return { min: min, max: max, per: intIn(g.per, 1, 5, 1), drawn: drawn };
  }

  /** カードの設定 {seed, max, count, perPage, title, credit} */
  function normalizeCards(c, fallbackSeed) {
    c = obj(c);
    return {
      seed: normalizeSeed(c.seed) || fallbackSeed || null,
      max: CARD_MAXES.indexOf(Number(c.max)) >= 0 ? Number(c.max) : 75,
      count: intIn(c.count, 1, LIMITS.maxCards, 40),
      perPage: Number(c.perPage) === 2 ? 2 : 4,
      title: str(c.title, LIMITS.titleLen),
      credit: c.credit !== false,
    };
  }

  /** 景品の並び [{name, winner}] */
  function normalizePrizes(p) {
    return (Array.isArray(p) ? p : []).slice(0, LIMITS.maxPrizes).map(function (x) {
      x = obj(x);
      return { name: str(x.name, LIMITS.prizeLen), winner: str(x.winner, LIMITS.winnerLen) };
    });
  }

  /** 画面の設定 {sound, voice, sayLetter（読み上げで列の文字も言う。既定は数字だけ）, effect} */
  function normalizeSettings(s) {
    s = obj(s);
    return {
      sound: s.sound !== false,
      voice: s.voice === true,
      sayLetter: s.sayLetter === true,
      effect: ['normal', 'short', 'off'].indexOf(s.effect) >= 0 ? s.effect : 'normal',
    };
  }

  // ---------------------------------------------------------------
  // 共有リンク（#s=）: カードの設定だけを入れる。抽選の状態は入れない
  // ---------------------------------------------------------------
  function b64urlEncode(s) {
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    var bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function encodeShare(cards) {
    var c = normalizeCards(cards);
    return '#s=' + b64urlEncode(JSON.stringify({ v: 1, seed: c.seed, max: c.max, count: c.count, perPage: c.perPage, title: c.title }));
  }

  /** 共有リンクの # 以降を読む。読めなければ null（印刷クレジットの設定は受け取る側のものを使う） */
  function decodeShare(hash) {
    var m = /^#s=([A-Za-z0-9_-]{1,2000})$/.exec(hash || '');
    if (!m) return null;
    var o;
    try { o = JSON.parse(b64urlDecode(m[1])); } catch (e) { return null; }
    if (!o || o.v !== 1 || !normalizeSeed(o.seed)) return null;
    var c = normalizeCards(o);
    delete c.credit;
    return c;
  }

  // ---------------------------------------------------------------
  // バックアップファイル（README「ツールを追加するとき」20。決定 D31）
  // 形式: { tool, version, exportedAt, data }。data はブラウザに保存しているものと同じ形
  // ---------------------------------------------------------------
  var BACKUP_VERSION = 1;

  /** 書き出すファイル名: <ツール名>-backup-YYYYMMDD.json（日付は端末の時計） */
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }

  /** 書き出す中身 */
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }

  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は normalize* で行う
   * @returns {{ok: true, data: object} | {ok: false, code: string, tool?: string}}
   *   code: unreadable（JSON でない）/ otherTool / newer（新しい版）/ format / missing。画面の文は text.js
   */
  function parseBackup(text, tool, requiredKeys) {
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') return { ok: false, code: 'unreadable' };
    if (o.tool !== tool) return { ok: false, code: 'otherTool', tool: o.tool.slice(0, 40) };
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, code: typeof o.version === 'number' && o.version > BACKUP_VERSION ? 'newer' : 'format' };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, code: 'missing' };
    return { ok: true, data: data };
  }

  var api = {
    mulberry32: mulberry32, hashString: hashString, makeRng: makeRng,
    ALPHABET: ALPHABET, newSeed: newSeed, toHalf: toHalf, normalizeSeed: normalizeSeed,
    setTag: setTag, cardId: cardId, parseCardId: parseCardId,
    CARD_MAXES: CARD_MAXES, LETTERS: LETTERS, FREE: FREE, LINES: LINES,
    columnRanges: columnRanges, letterOf: letterOf, genCardSet: genCardSet, checkCard: checkCard, setStatus: setStatus,
    remaining: remaining, drawNumbers: drawNumbers, undoLast: undoLast, simulateDraws: simulateDraws,
    LIMITS: LIMITS, normalizeGame: normalizeGame, normalizeCards: normalizeCards, normalizePrizes: normalizePrizes, normalizeSettings: normalizeSettings,
    encodeShare: encodeShare, decodeShare: decodeShare,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
