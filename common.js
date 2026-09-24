// ===========================
// 大人数ビンゴ抽選 — 抽選ページとカードページで共通の道具（保存・バックアップ・コピー・乱数・オフライン）
// ===========================
(function (root) {
  'use strict';
  var T = root.TEXT, C = root.Calc;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "bingo_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'bingo_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }   // 保存できない環境（プライベートモードなど）でも動くように
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  // 保存しているもの（バックアップの data もこの形）
  var KEYS = ['game', 'cards', 'prizes', 'settings'];

  function loadAll() {
    return {
      game: C.normalizeGame(store.get('game', null)),
      cards: store.get('cards', null) ? C.normalizeCards(store.get('cards', null)) : null,
      prizes: C.normalizePrizes(store.get('prizes', [])),
      settings: C.normalizeSettings(store.get('settings', null)),
    };
  }

  /** 0 以上 1 未満（抽選・新しい seed に使う。crypto が無ければ Math.random） */
  function rand() {
    try {
      var a = new Uint32Array(1);
      root.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    } catch (e) { return Math.random(); }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* 下で失敗扱い */ }
      ta.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }

  // --- ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31） ---
  // data は store に保存しているものと同じ形。中身はこの端末の中で作り、どこにも送信しない
  var TOOL = 'bingo';
  function wireBackup(onImported) {
    var msg = document.getElementById('backup-msg');
    var fileInput = document.getElementById('backup-file');
    document.getElementById('backup-export').addEventListener('click', function () {
      var data = loadAll();
      var blob = new Blob([JSON.stringify(C.buildBackup(TOOL, data), null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = C.backupFileName(TOOL);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      msg.textContent = T.backupExported;
    });
    document.getElementById('backup-import').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      if (file.size > 1024 * 1024) { msg.textContent = T.backupTooBig; return; }
      file.text().then(function (text) {
        var r = C.parseBackup(text, TOOL, ['game']);   // tool・version・必須のキーを確かめる
        if (!r.ok) {
          var e = T.backupError[r.code];
          msg.textContent = typeof e === 'function' ? e(r.tool) : e;
          return;
        }
        if (!root.confirm(T.backupConfirm)) return;
        var d = r.data;
        store.set('game', C.normalizeGame(d.game));
        var cards = d.cards ? C.normalizeCards(d.cards) : null;
        store.set('cards', cards && cards.seed ? cards : null);
        store.set('prizes', C.normalizePrizes(d.prizes));
        store.set('settings', C.normalizeSettings(d.settings));
        msg.textContent = T.backupImported;
        onImported();
      }, function () { msg.textContent = T.backupUnreadable; });
    });
  }

  // --- オフライン対応 ---
  // 登録は sw.js だけ。scope: '/' を指定しない（README「ツールを追加するとき」13）
  // sw.js はこのファイルと同じ /bingo/ にある。英語版（/bingo/en/）からも同じ sw.js を登録する（scope は /bingo/ で en/ も含む）
  var SW_URL = (function () {
    try { return new URL('sw.js', document.currentScript.src).href; } catch (e) { return './sw.js'; }
  })();
  function registerSW() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      addEventListener('load', function () { navigator.serviceWorker.register(SW_URL).catch(function () {}); });
    }
  }

  root.Common = { store: store, KEYS: KEYS, loadAll: loadAll, rand: rand, copyText: copyText, wireBackup: wireBackup, registerSW: registerSW };
})(this);
