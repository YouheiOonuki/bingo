// ===========================
// 大人数ビンゴ抽選 — みんなで同じ画面（yorozu-plans ROADMAP 7.36.2 K146、企画書 83）のつながり
// 司会の画面（main.js）と参加の画面（join/join.js）で共通。部屋は yorozu-ai の Durable Object（番号の列・範囲・作成時刻・ビンゴの数だけを持ち、3 時間で消える）
// 送るのは番号の列（司会）と「ビンゴが出た」（参加者、1 回）だけ。名前・カード・端末の情報は送らない
// ===========================
(function (root) {
  'use strict';
  var API = 'https://yorozu-ai.oonuki-youhei.workers.dev/v1/room';
  var WS = API.replace(/^https/, 'wss');
  var CODE_RE = /^\d{4}[ABCDEFGHJKMNPQRSTUVWXYZ]$/;
  var KEEP_MS = 25000;   // つながりを保つための hello の間隔（企画書 83 の 2 章: 30 人・3 時間で 1 日の無料枠の 1% 未満）

  function normalizeCode(s) {
    var c = String(s == null ? '' : s).replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (x) { return String.fromCharCode(x.charCodeAt(0) - 0xFEE0); }).replace(/[\s-]/g, '').toUpperCase();
    return CODE_RE.test(c) ? c : '';
  }

  function joinUrl(code, lang) {
    return 'https://yorozu-craft.com/bingo/' + (lang === 'en' ? 'en/' : '') + 'join/?r=' + code;
  }

  function request(path, init) {
    return fetch(API + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    });
  }

  /** 部屋を作る → {ok, code, key, expiresAt} か {ok:false, error} */
  function create(max) {
    return request('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ max: max }) })
      .catch(function () { return { ok: false, error: 'network' }; });
  }
  function info(code) {
    return request('/' + code).catch(function () { return { ok: false, error: 'network' }; });
  }
  function close(code, key) {
    return request('/' + code + '/close', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: key }) })
      .catch(function () { return { ok: false, error: 'network' }; });
  }

  /**
   * 部屋につなぐ。切れたらつなぎ直す（1 秒から 15 秒まで延ばす）。部屋が無くなったら（期限・司会が閉じた）onGone
   * opts: { code, key（司会だけ）, onState(state), onStatus('open'|'retry'), onGone(), onOpen(conn) }
   */
  function connect(opts) {
    var ws = null, timer = null, keep = null, wait = 1000, stopped = false;
    var conn = {
      send: function (obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; },
      stop: function () { stopped = true; clearTimeout(timer); clearInterval(keep); if (ws) try { ws.close(1000); } catch (e) { /* もう閉じている */ } },
    };
    function open() {
      if (stopped) return;
      ws = new WebSocket(WS + '/' + opts.code + '/ws' + (opts.key ? '?key=' + encodeURIComponent(opts.key) : ''));
      ws.onopen = function () {
        wait = 1000;
        conn.send({ t: 'hello' });
        clearInterval(keep);
        keep = setInterval(function () { conn.send({ t: 'hello' }); }, KEEP_MS);
        if (opts.onStatus) opts.onStatus('open');
        if (opts.onOpen) opts.onOpen(conn);
      };
      ws.onmessage = function (e) {
        var m;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m && m.t === 'state' && opts.onState) opts.onState(m);
      };
      ws.onclose = function (e) {
        clearInterval(keep);
        if (stopped) return;
        if (e.code === 4000) { stopped = true; if (opts.onGone) opts.onGone(); return; }
        if (opts.onStatus) opts.onStatus('retry');
        // 部屋がまだあるか確かめてから、つなぎ直す（無ければ閉じる）
        timer = setTimeout(function () {
          info(opts.code).then(function (j) {
            if (j.status === 404) { stopped = true; if (opts.onGone) opts.onGone(); return; }
            open();
          });
        }, wait);
        wait = Math.min(wait * 2, 15000);
      };
    }
    open();
    // スマホが眠りから戻ったら、すぐつなぎ直す
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !stopped && ws && ws.readyState > 1) { clearTimeout(timer); wait = 1000; open(); }
    });
    return conn;
  }

  root.Room = { API: API, CODE_RE: CODE_RE, normalizeCode: normalizeCode, joinUrl: joinUrl, create: create, info: info, close: close, connect: connect };
})(this);
