// ===========================
// 大人数ビンゴ抽選 — 抽選ページの制御
// ロジックは calc.js（純粋関数）、画面に出す文は text.js、保存などは common.js
// ===========================
(function () {
  'use strict';
  var C = window.Calc, T = window.TEXT, K = window.Common;
  var $ = function (id) { return document.getElementById(id); };

  var state = K.loadAll();
  var cardSet = null;      // 今のカードの組（照合と状況に使う）

  function save(name) { K.store.set(name, state[name]); }
  function refreshCardSet() {
    cardSet = state.cards && state.cards.seed ? C.genCardSet(state.cards.seed, state.cards.max, state.cards.count) : null;
  }
  refreshCardSet();

  function g() { return state.game; }
  function letter(n) { return C.letterOf(n, g().min, g().max); }
  function label(n) { return T.numberLabel(n, letter(n)); }

  // ---------------------------------------------------------------
  // 効果音（Web Audio。音声ファイルは使わない）
  // ---------------------------------------------------------------
  var audio = null;
  function ac() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audio = new AC(); } catch (e) { return null; }
    }
    if (audio.state === 'suspended') audio.resume().catch(function () {});
    return audio;
  }
  var noiseBuf = null;
  function noise(ctx) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    return noiseBuf;
  }
  /** ドラムロール（小太鼓の粒を細かく並べる）。止めるための関数を返す */
  function drumroll(seconds) {
    var ctx = state.settings.sound && ac();
    if (!ctx) return function () {};
    var master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    var t = ctx.currentTime + 0.02, end = t + seconds;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.8;
    filter.connect(master);
    var i = 0;
    while (t < end) {
      var src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      var gn = ctx.createGain();
      var k = (t - (end - seconds)) / seconds;       // 後ろほど強く
      gn.gain.value = 0.25 + 0.55 * k + (i % 2 ? 0 : 0.1);
      src.connect(gn); gn.connect(filter);
      src.start(t);
      t += 0.045; i++;
    }
    return function () {
      try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } catch (e) { /* 止まっていればよい */ }
      setTimeout(function () { try { master.disconnect(); } catch (e) { /* 同上 */ } }, 300);
    };
  }
  /** 数が決まったときの音（シンバル風のノイズ＋2 音のチャイム） */
  function chime() {
    var ctx = state.settings.sound && ac();
    if (!ctx) return;
    var t = ctx.currentTime + 0.01;
    var src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    var ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
    src.start(t);
    [[1318.5, 0], [1760, 0.12]].forEach(function (p) {
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = p[0];
      og.gain.setValueAtTime(0.0001, t + p[1]);
      og.gain.exponentialRampToValueAtTime(0.25, t + p[1] + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + p[1] + 0.9);
      o.connect(og); og.connect(ctx.destination);
      o.start(t + p[1]); o.stop(t + p[1] + 1);
    });
  }

  // ---------------------------------------------------------------
  // 読み上げ（speechSynthesis。言語は text.js の speech.lang）
  // ---------------------------------------------------------------
  function speak(text) {
    if (!state.settings.voice || !('speechSynthesis' in window)) return;
    try {
      var s = window.speechSynthesis;
      s.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = T.speech.lang;
      var voice = s.getVoices().filter(function (v) { return v.lang && v.lang.replace('_', '-').indexOf(T.speech.lang) === 0; })[0];
      if (voice) u.voice = voice;
      u.rate = 0.95;
      s.speak(u);
    } catch (e) { /* 読み上げできない端末では何もしない */ }
  }
  function speakNumbers(list) {
    speak(list.map(function (n) { return T.speech.one(n, state.settings.sayLetter ? letter(n) : ''); }).join(T.speech.join));
  }

  // ---------------------------------------------------------------
  // 出た数の一覧（B・I・N・G・O の行、または番号の並び）
  // ---------------------------------------------------------------
  var boardKey = '', cells = {};
  function buildBoard() {
    var key = g().min + '-' + g().max;
    if (key === boardKey) return;
    boardKey = key; cells = {};
    var board = $('board');
    board.textContent = '';
    var size = g().max - g().min + 1;
    var lettered = letter(g().min) !== '';
    board.className = 'board' + (lettered ? ' board--bingo' : '') + (size > 300 ? ' board--list' : '');
    if (size > 300) return;   // 大きい範囲は出た数だけを並べる（renderBoard）
    function cell(n) {
      var s = document.createElement('span');
      s.className = 'cell';
      s.textContent = n;
      cells[n] = s;
      return s;
    }
    if (lettered) {
      var per = g().max / 5;
      board.style.setProperty('--cols', String(per <= 15 ? per : Math.ceil(per / 2)));   // スマホでは 1 行 15 個まで
      C.LETTERS.forEach(function (L, c) {
        var row = document.createElement('div');
        row.className = 'board-row';
        var h = document.createElement('span');
        h.className = 'board-letter';
        h.textContent = L;
        row.appendChild(h);
        var wrap = document.createElement('div');
        wrap.className = 'board-cells';
        for (var n = c * per + 1; n <= (c + 1) * per; n++) wrap.appendChild(cell(n));
        row.appendChild(wrap);
        board.appendChild(row);
      });
    } else {
      var wrap2 = document.createElement('div');
      wrap2.className = 'board-cells';
      for (var m = g().min; m <= g().max; m++) wrap2.appendChild(cell(m));
      board.appendChild(wrap2);
    }
  }
  function renderBoard(hideLast) {
    buildBoard();
    var drawn = g().drawn;
    var shown = hideLast ? drawn.slice(0, drawn.length - hideLast) : drawn;
    var on = {};
    shown.forEach(function (n) { on[n] = true; });
    var last = shown[shown.length - 1];
    if (g().max - g().min + 1 > 300) {
      var board = $('board');
      board.textContent = '';
      var wrap = document.createElement('div');
      wrap.className = 'board-cells';
      shown.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
        var s = document.createElement('span');
        s.className = 'cell on' + (n === last ? ' last' : '');
        s.textContent = n;
        wrap.appendChild(s);
      });
      board.appendChild(wrap);
    } else {
      Object.keys(cells).forEach(function (n) {
        var el = cells[n];
        el.classList.toggle('on', !!on[n]);
        el.classList.toggle('last', Number(n) === last);
      });
    }
    var recent = shown.slice(-6).reverse().map(label);
    $('recent').textContent = recent.length ? T.recent(recent) : T.recentNone;
  }

  // ---------------------------------------------------------------
  // 抽選の画面
  // ---------------------------------------------------------------
  var anim = null;   // { timer, stop, picked, done }

  function total() { return g().max - g().min + 1; }
  function renderCount(hideLast) {
    var n = g().drawn.length - (hideLast || 0);
    var rest = total() - n;
    $('stage-count').textContent = rest > 0 ? T.count(n, rest) : T.countDone(n);
    var btn = $('btn-draw');
    btn.textContent = anim ? T.drawSkip : rest > 0 ? T.draw : T.drawDone;
    btn.disabled = !anim && rest <= 0;
    $('btn-undo').disabled = !!anim || g().drawn.length === 0;
  }
  function showBall(n) {
    $('ball-num').textContent = n == null ? '?' : n;
    var L = n == null ? '' : letter(n);
    $('ball-letter').textContent = L;
    $('ball').dataset.col = L;
  }
  function renderBatch(picked) {
    var el = $('batch');
    if (picked && picked.length > 1) {
      el.hidden = false;
      el.textContent = picked.map(label).join('　');
    } else {
      el.hidden = true;
    }
  }
  function renderStatus(hideLast) {
    var el = $('set-status');
    if (!cardSet || state.cards.max !== g().max || g().min !== 1) { el.hidden = true; return; }
    var shown = hideLast ? g().drawn.slice(0, g().drawn.length - hideLast) : g().drawn;
    var s = C.setStatus(cardSet, shown);
    el.hidden = false;
    el.textContent = T.setStatus(s.bingo, s.reach, s.total);
  }
  function renderNextPrize() {
    var el = $('next-prize');
    var list = state.prizes;
    if (!list.length) { el.hidden = true; return; }
    el.hidden = false;
    var i = nextPrizeIndex();
    el.textContent = i < 0 ? T.prizesDone : T.nextPrize(list[i].name || T.prizeUnnamed, i + 1, list.length);
  }
  function nextPrizeIndex() {
    for (var i = 0; i < state.prizes.length; i++) if (!state.prizes[i].winner) return i;
    return -1;
  }
  function renderStage(hideLast) {
    renderCount(hideLast);
    renderBoard(hideLast);
    renderStatus(hideLast);
    renderNextPrize();
  }

  function effectMs() {
    var e = state.settings.effect;
    if (e === 'off') return 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return e === 'short' || reduce ? 600 : 2000;
  }

  function draw() {
    if (anim) { anim.done(); return; }    // 演出の途中なら、すぐ出す
    if (g().drawn.length >= total()) return;
    // 先に決めて保存する（演出の途中で再読み込みしても、引き直しにならない）
    var r = C.drawNumbers(g().min, g().max, g().drawn, g().per, K.rand);
    if (!r.picked.length) return;
    g().drawn = r.drawn;
    save('game');
    var ms = effectMs();
    if (!ms) { reveal(r.picked); return; }

    var pool = C.remaining(g().min, g().max, []);
    var ball = $('ball');
    ball.classList.add('spinning');
    renderBatch(null);
    var stop = drumroll(ms / 1000);
    var timer = setInterval(function () { showBall(pool[Math.floor(Math.random() * pool.length)]); }, 60);
    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(to);
      stop();
      ball.classList.remove('spinning');
      anim = null;
      reveal(r.picked);
    };
    var to = setTimeout(done, ms);
    anim = { done: done };
    renderStage(r.picked.length);
  }

  function reveal(picked) {
    showBall(picked[picked.length - 1]);
    renderBatch(picked);
    var ball = $('ball');
    ball.classList.remove('pop');
    void ball.offsetWidth;
    ball.classList.add('pop');
    renderStage(0);
    chime();
    speakNumbers(picked);
    $('announce').textContent = T.announce(picked.map(label));
  }

  function undo() {
    if (anim || !g().drawn.length) return;
    var lastN = g().drawn[g().drawn.length - 1];
    if (!window.confirm(T.undoConfirm(label(lastN)))) return;
    g().drawn = C.undoLast(g().drawn).drawn;
    save('game');
    var d = g().drawn;
    showBall(d.length ? d[d.length - 1] : null);
    renderBatch(null);
    renderStage(0);
  }

  // ---------------------------------------------------------------
  // 全画面（プロジェクター用）。Fullscreen API が無い端末（iPhone）は画面いっぱいに広げるだけ
  // ---------------------------------------------------------------
  var stage = $('stage');
  function isFull() { return !!document.fullscreenElement || document.body.classList.contains('is-max'); }
  function toggleFull() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
    if (document.body.classList.contains('is-max')) { document.body.classList.remove('is-max'); renderFull(); return; }
    if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(function () { document.body.classList.add('is-max'); renderFull(); });
    } else {
      document.body.classList.add('is-max');
      renderFull();
    }
  }
  function renderFull() {
    var f = isFull();
    stage.classList.toggle('is-full', f);
    $('btn-full').textContent = f ? T.fullOff : T.fullOn;
    $('btn-full').setAttribute('aria-pressed', String(f));
  }
  document.addEventListener('fullscreenchange', renderFull);

  // ---------------------------------------------------------------
  // 効果音・読み上げの切り替え
  // ---------------------------------------------------------------
  function renderToggles() {
    $('btn-sound').setAttribute('aria-pressed', String(state.settings.sound));
    $('btn-voice').setAttribute('aria-pressed', String(state.settings.voice));
  }
  function toggleSetting(name) {
    state.settings[name] = !state.settings[name];
    save('settings');
    renderToggles();
    if (name === 'sound' && state.settings.sound) ac();
    if (name === 'voice' && !state.settings.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ボタンをマウスで押したあとは、スペースキーで引けるように「数字を引く」へフォーカスを戻す
  function backToDraw(e) { if (e && e.detail > 0) $('btn-draw').focus({ preventScroll: true }); }

  $('btn-draw').addEventListener('click', function () { ac(); draw(); });
  $('btn-undo').addEventListener('click', function (e) { undo(); backToDraw(e); });
  $('btn-full').addEventListener('click', function (e) { toggleFull(); backToDraw(e); });
  $('btn-sound').addEventListener('click', function (e) { toggleSetting('sound'); backToDraw(e); });
  $('btn-voice').addEventListener('click', function (e) { toggleSetting('voice'); backToDraw(e); });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, button, a, summary, [contenteditable]')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) { ac(); draw(); }
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFull();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSetting('sound');
    } else if (e.key === 'v' || e.key === 'V') {
      toggleSetting('voice');
    } else if (e.key === 'Escape' && document.body.classList.contains('is-max')) {
      document.body.classList.remove('is-max');
      renderFull();
    }
  });

  // ---------------------------------------------------------------
  // 設定（範囲・1 回に引く数・演出）
  // ---------------------------------------------------------------
  function renderSettings() {
    var game = g();
    var preset = game.min === 1 && C.CARD_MAXES.indexOf(game.max) >= 0 ? String(game.max) : 'custom';
    if ($('range').value !== 'custom' || preset !== 'custom') $('range').value = preset;
    $('custom-range').hidden = $('range').value !== 'custom';
    $('min').value = game.min;
    $('max').value = game.max;
    var locked = game.drawn.length > 0;
    ['range', 'min', 'max'].forEach(function (id) { $(id).disabled = locked; });
    $('range-lock').hidden = !locked;
    $('per').value = String(game.per);
    $('effect').value = state.settings.effect;
    $('say-letter').checked = state.settings.sayLetter;
  }
  function applyRange() {
    if (g().drawn.length) return;
    var v = $('range').value;
    var min = 1, max = 75;
    if (v === 'custom') {
      min = Math.max(1, Math.min(998, Math.floor(Number($('min').value)) || 1));
      max = Math.max(min + 1, Math.min(999, Math.floor(Number($('max').value)) || 75));
    } else {
      max = Number(v);
    }
    state.game = C.normalizeGame({ min: min, max: max, per: g().per, drawn: [] });
    save('game');
    renderSettings();
    renderStage(0);
    showBall(null);
  }
  $('range').addEventListener('change', function () {
    $('custom-range').hidden = this.value !== 'custom';
    applyRange();
  });
  $('min').addEventListener('change', applyRange);
  $('max').addEventListener('change', applyRange);
  $('per').addEventListener('change', function () { g().per = Number(this.value) || 1; save('game'); });
  $('effect').addEventListener('change', function () { state.settings.effect = this.value; save('settings'); });
  $('say-letter').addEventListener('change', function () { state.settings.sayLetter = this.checked; save('settings'); });
  $('btn-reset').addEventListener('click', function () {
    if (!window.confirm(T.resetConfirm)) return;
    g().drawn = [];
    save('game');
    state.prizes.forEach(function (p) { p.winner = ''; });
    save('prizes');
    showBall(null);
    renderBatch(null);
    renderAll();
  });

  // ---------------------------------------------------------------
  // 照合（カード番号 → ビンゴか）
  // ---------------------------------------------------------------
  function renderCheckAvailability() {
    $('check-noset').hidden = !!cardSet;
  }
  function miniCard(card, res) {
    var lineCells = {};
    res.lines.forEach(function (li) { C.LINES[li].forEach(function (i) { lineCells[i] = true; }); });
    var tbl = document.createElement('table');
    tbl.className = 'mini-card';
    var thead = document.createElement('tr');
    C.LETTERS.forEach(function (L) { var th = document.createElement('th'); th.textContent = L; thead.appendChild(th); });
    tbl.appendChild(thead);
    for (var r = 0; r < 5; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < 5; c++) {
        var i = r * 5 + c, td = document.createElement('td');
        td.textContent = i === C.FREE ? T.free : card[i];
        if (res.marked[i]) td.className = 'hit';
        if (lineCells[i]) td.className = 'hit line';
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    return tbl;
  }
  $('check-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var out = $('check-result');
    out.textContent = '';
    var p = function (text, cls) { var el = document.createElement('p'); el.textContent = text; if (cls) el.className = cls; out.appendChild(el); return el; };
    if (!cardSet) { p($('check-noset').textContent, 'warn'); return; }
    var c = state.cards;
    var r = C.parseCardId($('check-id').value, c.seed, c.max, c.count);
    if (!r.ok) {
      var reason = T.checkReason[r.reason];
      p(typeof reason === 'function' ? reason(c.count) : reason, 'warn');
      return;
    }
    var id = C.cardId(c.seed, c.max, r.index);
    if (g().min !== 1 || g().max !== c.max) p(T.checkRangeWarn(c.max, g().min, g().max), 'warn');
    var res = C.checkCard(cardSet[r.index], g().drawn);
    p(res.bingo ? T.checkBingo(id, res.bingoAt, label(res.bingoNumber), res.lines.length) : T.checkNot(id, res.reach), res.bingo ? 'ok big' : 'no');
    out.appendChild(miniCard(cardSet[r.index], res));
    if (res.bingo) {
      speak(T.speech.bingo);
      var already = state.prizes.filter(function (x) { return x.winner === T.cardNo(id); })[0];
      if (already) p(T.checkAlready(already.name || T.prizeUnnamed), 'warn');
      var ni = nextPrizeIndex();
      if (!already && ni >= 0) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.textContent = T.giveNext(state.prizes[ni].name || T.prizeUnnamed);
        b.addEventListener('click', function () {
          state.prizes[ni].winner = T.cardNo(id);
          save('prizes');
          renderPrizes();
          renderNextPrize();
          b.remove();
        });
        out.appendChild(b);
      }
    }
  });

  // ---------------------------------------------------------------
  // 景品の順番
  // ---------------------------------------------------------------
  function renderPrizes() {
    var ol = $('prize-list');
    ol.textContent = '';
    var next = nextPrizeIndex();
    state.prizes.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'prize' + (i === next ? ' is-next' : '') + (p.winner ? ' is-done' : '');
      var name = document.createElement('input');
      name.type = 'text'; name.maxLength = C.LIMITS.prizeLen; name.value = p.name; name.className = 'prize-name';
      name.setAttribute('aria-label', (i + 1) + '. ' + (p.name || T.prizeUnnamed));
      name.addEventListener('change', function () { p.name = this.value.slice(0, C.LIMITS.prizeLen); save('prizes'); renderNextPrize(); });
      var win = document.createElement('input');
      win.type = 'text'; win.maxLength = C.LIMITS.winnerLen; win.value = p.winner; win.placeholder = T.prizeWinner; win.className = 'prize-winner';
      win.setAttribute('aria-label', T.prizeWinner + '（' + (i + 1) + '）');
      win.addEventListener('change', function () { p.winner = this.value.slice(0, C.LIMITS.winnerLen); save('prizes'); renderPrizes(); renderNextPrize(); });
      var tools = document.createElement('span');
      tools.className = 'prize-tools';
      [['↑', T.prizeUp, -1], ['↓', T.prizeDown, 1]].forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mini-btn'; b.textContent = d[0]; b.title = d[1];
        b.setAttribute('aria-label', d[1]);
        b.disabled = i + d[2] < 0 || i + d[2] >= state.prizes.length;
        b.addEventListener('click', function () {
          var j = i + d[2];
          var t = state.prizes[i]; state.prizes[i] = state.prizes[j]; state.prizes[j] = t;
          save('prizes'); renderPrizes(); renderNextPrize();
        });
        tools.appendChild(b);
      });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'mini-btn'; del.textContent = '×'; del.title = T.prizeDelete;
      del.setAttribute('aria-label', T.prizeDelete);
      del.addEventListener('click', function () {
        if (!window.confirm(T.prizeDeleteConfirm(p.name || T.prizeUnnamed))) return;
        state.prizes.splice(i, 1);
        save('prizes'); renderPrizes(); renderNextPrize();
      });
      tools.appendChild(del);
      var no = document.createElement('span');
      no.className = 'prize-no';
      no.textContent = (i + 1) + '.';
      li.appendChild(no); li.appendChild(name); li.appendChild(win); li.appendChild(tools);
      ol.appendChild(li);
    });
  }
  function addPrizes(names) {
    var added = 0;
    names.forEach(function (n) {
      n = n.trim();
      if (!n) return;
      if (state.prizes.length >= C.LIMITS.maxPrizes) return;
      state.prizes.push({ name: n.slice(0, C.LIMITS.prizeLen), winner: '' });
      added++;
    });
    if (names.filter(function (n) { return n.trim(); }).length > added) window.alert(T.prizeFull(C.LIMITS.maxPrizes));
    save('prizes'); renderPrizes(); renderNextPrize();
  }
  $('prize-form').addEventListener('submit', function (e) {
    e.preventDefault();
    addPrizes([$('prize-name').value]);
    $('prize-name').value = '';
  });
  $('prize-bulk-add').addEventListener('click', function () {
    addPrizes($('prize-bulk').value.split(/\r?\n/));
    $('prize-bulk').value = '';
  });

  // ---------------------------------------------------------------
  // 時間の目安
  // ---------------------------------------------------------------
  function estimateDefaults() {
    if (cardSet) $('est-people').value = state.cards.count;
    if (state.prizes.length) $('est-prizes').value = state.prizes.length;
  }
  $('btn-estimate').addEventListener('click', function () {
    var out = $('est-result');
    var people = Math.max(1, Math.min(200, Math.floor(Number($('est-people').value)) || 1));
    var prizes = Math.max(1, Math.min(200, Math.floor(Number($('est-prizes').value)) || 1));
    var sec = Math.max(3, Math.min(120, Number($('est-sec').value) || 15));
    out.textContent = T.estimateBusy;
    setTimeout(function () {
      var fromSet = !!(cardSet && state.cards.count === people);
      var max = fromSet ? state.cards.max : (C.CARD_MAXES.indexOf(g().max) >= 0 && g().min === 1 ? g().max : 75);
      var cards = fromSet ? cardSet : C.genCardSet(C.newSeed(K.rand), max, people);
      var s = C.simulateDraws(cards, max, prizes, 300, Math.random);
      var rows = [1, 2, 3].map(function (per) { return { per: per, times: Math.ceil(s.median / per) }; });
      out.textContent = '';
      T.estimate({ prizes: Math.min(prizes, people), people: people, p10: s.p10, median: s.median, p90: s.p90, rows: rows, sec: sec, current: g().per, fromSet: fromSet })
        .forEach(function (line) { var p = document.createElement('p'); p.textContent = line; out.appendChild(p); });
    }, 30);
  });

  // ---------------------------------------------------------------
  // カードの組の表示
  // ---------------------------------------------------------------
  function renderCardsSummary() {
    var c = state.cards;
    $('cards-summary').textContent = c && c.seed ? T.cardsSummary({ count: c.count, max: c.max, seed: c.seed, tag: C.setTag(c.seed, c.max) }) : T.cardsNone;
  }

  // ---------------------------------------------------------------
  // 終わったら: 結果のまとめ（ここにだけ、ほかのツールへの 2 行を出す）
  // ---------------------------------------------------------------
  function summaryText() {
    var d = new Date();
    return T.summary({
      date: d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(),
      count: g().drawn.length,
      range: g().min + '〜' + g().max,
      prizes: state.prizes,
      order: g().drawn.map(label),
    });
  }
  $('btn-finish').addEventListener('click', function () {
    $('summary-text').textContent = summaryText();
    $('summary').hidden = false;
  });
  $('btn-copy-summary').addEventListener('click', function () {
    K.copyText($('summary-text').textContent).then(function () { $('copy-msg').textContent = T.copied; }, function () { $('copy-msg').textContent = T.copyFailed; });
  });

  // ---------------------------------------------------------------
  // 全体
  // ---------------------------------------------------------------
  function renderAll() {
    renderSettings();
    renderToggles();
    renderStage(0);
    renderPrizes();
    renderCheckAvailability();
    renderCardsSummary();
    estimateDefaults();
    renderFull();
  }

  K.wireBackup(function () {
    state = K.loadAll();
    refreshCardSet();
    boardKey = '';
    var d = g().drawn;
    showBall(d.length ? d[d.length - 1] : null);
    renderBatch(null);
    renderAll();
  });

  // ほかのタブ（カード印刷のページ）でカードを変えたら読み直す
  window.addEventListener('storage', function (e) {
    if (e.key === 'bingo_cards') {
      state.cards = K.loadAll().cards;
      refreshCardSet();
      renderStatus(0); renderCheckAvailability(); renderCardsSummary(); estimateDefaults();
    }
  });

  var d0 = g().drawn;
  showBall(d0.length ? d0[d0.length - 1] : null);
  renderAll();
  K.registerSW();
})();
