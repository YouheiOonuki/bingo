// ===========================
// 大人数ビンゴ抽選 — 参加の画面（みんなで。yorozu-plans ROADMAP 7.36.2 K146、企画書 83）
// カードはこの端末で作る（calc.js の genCardSet。部屋ごとの乱数の seed をこの端末にだけ保存）。部屋から受け取るのは番号の列だけで、
// リーチ・ビンゴはこの端末で判定する。部屋へ送るのは「ビンゴが出た」の 1 回だけ（名前・カードは送らない）
// ===========================
(function () {
  'use strict';
  var C = window.Calc, T = window.TEXT, R = window.Room, RT = T.room;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'bingo_join';   // { code, seed, max, told }（この端末の中だけ）

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 保存できなくても遊べる */ } }
  function rand() {
    try { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); }
  }

  var me = null, card = null, conn = null, lastCount = -1;

  function buildCard() {
    var t = $('card');
    t.textContent = '';
    var head = document.createElement('tr');
    C.LETTERS.forEach(function (L) { var th = document.createElement('th'); th.textContent = L; head.appendChild(th); });
    var thead = document.createElement('thead');
    thead.appendChild(head);
    t.appendChild(thead);
    var body = document.createElement('tbody');
    for (var r = 0; r < 5; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < 5; c++) {
        var i = r * 5 + c, td = document.createElement('td');
        td.textContent = i === C.FREE ? T.free : String(card[i]);
        td.id = 'cell-' + i;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    t.appendChild(body);
  }

  function label(n) { return T.numberLabel(n, C.letterOf(n, 1, me.max)); }

  function show(st) {
    var nums = st.numbers || [];
    var res = C.checkCard(card, nums);
    var inLine = {};
    res.lines.forEach(function (li) { C.LINES[li].forEach(function (i) { inLine[i] = true; }); });
    for (var i = 0; i < 25; i++) {
      var td = $('cell-' + i);
      td.classList.toggle('hit', res.marked[i]);
      td.classList.toggle('line', !!inLine[i]);
    }
    $('last').textContent = nums.length ? label(nums[nums.length - 1]) : '–';
    $('count').textContent = nums.length ? RT.count(nums.length) : RT.waiting;
    $('drawn').textContent = nums.length ? nums.slice().reverse().map(label).join(T.batchJoin) : '';
    var s = $('status');
    s.className = 'join-status' + (res.bingo ? ' is-bingo' : res.reach ? ' is-reach' : '');
    s.textContent = res.bingo ? RT.bingo : res.reach ? RT.reach(res.reach) : RT.none;
    if (nums.length !== lastCount && lastCount >= 0 && nums.length > lastCount && navigator.vibrate) navigator.vibrate(res.bingo ? [200, 100, 200] : 60);
    lastCount = nums.length;
    // ビンゴを部屋に 1 回だけ知らせる（数だけ。司会の画面に「ビンゴの知らせ N 人」と出る）
    if (res.bingo && !me.told && conn && conn.send({ t: 'bingo' })) { me.told = true; save(me); }
  }

  function start(code) {
    $('join-msg').textContent = '';
    R.info(code).then(function (j) {
      if (!j.ok) { $('join-msg').textContent = j.status === 404 ? RT.notFound : RT.network; return; }
      var saved = load();
      me = saved && saved.code === code && saved.max === j.max ? saved : { code: code, seed: C.newSeed(rand), max: j.max, told: false };
      save(me);
      card = C.genCardSet(me.seed, me.max, 1)[0];
      buildCard();
      $('join-form').hidden = true;
      $('play').hidden = false;
      $('joined').textContent = RT.joined(code);
      show(j);
      if (history.replaceState) history.replaceState(null, '', '?r=' + code);
      conn = R.connect({
        code: code,
        onState: show,
        onOpen: function () { $('conn').textContent = ''; },
        onStatus: function (s) { if (s === 'retry') $('conn').textContent = RT.retry; },
        onGone: function () { $('conn').textContent = RT.gone; },
      });
    });
  }

  $('join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = R.normalizeCode($('code').value);
    if (!code) { $('join-msg').textContent = RT.codeInvalid; return; }
    start(code);
  });

  var q = R.normalizeCode(new URLSearchParams(location.search).get('r'));
  if (q) { $('code').value = q; start(q); }
})();
