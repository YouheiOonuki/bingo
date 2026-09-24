// ===========================
// 大人数ビンゴ抽選 — カード印刷ページの制御
// 印刷の見本の DOM がそのまま印刷される（ブラウザのメニューから印刷しても白紙にならない）
// ===========================
(function () {
  'use strict';
  var C = window.Calc, T = window.TEXT, K = window.Common;
  var $ = function (id) { return document.getElementById(id); };

  var saved = K.loadAll().cards;
  var shared = C.decodeShare(location.hash);
  // 共有リンクで開いたときは、保存を押すまでこの端末の設定を上書きしない
  var cur = shared ? Object.assign({ credit: saved ? saved.credit : true }, shared)
    : saved || C.normalizeCards({ seed: C.newSeed(K.rand) });

  function persist() {
    if (shared) return;
    K.store.set('cards', cur);
    saved = cur;
  }

  function renderForm() {
    $('c-count').value = cur.count;
    $('c-max').value = String(cur.max);
    $('c-per').value = String(cur.perPage);
    $('c-title').value = cur.title;
    $('c-credit').checked = cur.credit;
    $('c-seed').textContent = cur.seed;
    $('c-tag').textContent = T.tagNote(C.setTag(cur.seed, cur.max));
    ['c-count', 'c-max', 'c-title', 'btn-new-seed', 'btn-apply-seed', 'c-seed-input'].forEach(function (id) { $(id).disabled = !!shared; });
    $('shared-banner').hidden = !shared;
    if (shared) $('shared-text').textContent = T.sharedBanner(cur);
  }

  function cardEl(card, index) {
    var wrap = document.createElement('div');
    wrap.className = 'bcard';
    if (cur.title) {
      var h = document.createElement('div');
      h.className = 'bcard-title';
      h.textContent = cur.title;
      wrap.appendChild(h);
    }
    var tbl = document.createElement('table');
    tbl.className = 'bcard-grid';
    var hr = document.createElement('tr');
    C.LETTERS.forEach(function (L) { var th = document.createElement('th'); th.textContent = L; hr.appendChild(th); });
    tbl.appendChild(hr);
    for (var r = 0; r < 5; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < 5; c++) {
        var i = r * 5 + c, td = document.createElement('td');
        if (i === C.FREE) { td.className = 'free'; td.textContent = T.free; } else td.textContent = card[i];
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    wrap.appendChild(tbl);
    var foot = document.createElement('div');
    foot.className = 'bcard-foot';
    var no = document.createElement('span');
    no.className = 'bcard-no';
    no.textContent = T.cardNo(C.cardId(cur.seed, cur.max, index));
    foot.appendChild(no);
    if (cur.credit) {
      var cr = document.createElement('span');
      cr.className = 'bcard-credit';
      cr.textContent = T.cardCredit;
      foot.appendChild(cr);
    }
    wrap.appendChild(foot);
    return wrap;
  }

  function renderSheets() {
    var cards = C.genCardSet(cur.seed, cur.max, cur.count);
    var box = $('sheets');
    box.textContent = '';
    var per = cur.perPage;
    var pages = Math.ceil(cards.length / per);
    for (var p = 0; p < pages; p++) {
      var sheet = document.createElement('div');
      sheet.className = 'sheet sheet--' + per;
      for (var k = 0; k < per; k++) {
        var idx = p * per + k;
        var slot = document.createElement('div');
        slot.className = 'slot';
        if (idx < cards.length) slot.appendChild(cardEl(cards[idx], idx));
        sheet.appendChild(slot);
      }
      box.appendChild(sheet);
    }
    $('sheet-info').textContent = T.sheetInfo(cards.length, pages, per);
    fitZoom();
  }

  // 見本を画面の幅に合わせて縮める（A4 の幅 210mm ≒ 794px）
  function fitZoom() {
    var w = $('sheets').clientWidth || 360;
    $('sheets').style.setProperty('--z', String(Math.min(1, (w - 4) / 794).toFixed(3)));
  }
  window.addEventListener('resize', fitZoom);
  // ブラウザのメニュー（Ctrl+P）から印刷したときも、照合できるように保存する
  window.addEventListener('beforeprint', function () { persist(); });

  function render() { renderForm(); renderSheets(); }

  function changeCards(patch, needsConfirm) {
    if (needsConfirm && saved && !window.confirm(T.newSeedConfirm)) { renderForm(); return; }
    cur = C.normalizeCards(Object.assign({}, cur, patch));
    persist();
    render();
  }

  $('c-count').addEventListener('change', function () { changeCards({ count: Math.max(1, Math.min(200, Math.floor(Number(this.value)) || 1)) }); });
  $('c-max').addEventListener('change', function () { changeCards({ max: Number(this.value) }, true); });
  $('c-per').addEventListener('change', function () {
    // 1 ページの枚数は受け取った側でも変えてよい（カードの中身は変わらない）
    cur = C.normalizeCards(Object.assign({}, cur, { perPage: Number(this.value) }));
    persist(); renderSheets();
  });
  $('c-title').addEventListener('change', function () { changeCards({ title: this.value }); });
  $('c-credit').addEventListener('change', function () {
    cur.credit = this.checked;
    if (!shared) persist(); else if (saved) { saved.credit = this.checked; K.store.set('cards', saved); }
    renderSheets();
  });
  $('btn-new-seed').addEventListener('click', function () { changeCards({ seed: C.newSeed(K.rand) }, true); $('seed-msg').textContent = T.seedApplied; });
  $('btn-apply-seed').addEventListener('click', function () {
    var s = C.normalizeSeed($('c-seed-input').value);
    if (!s) { $('seed-msg').textContent = T.seedInvalid; return; }
    if (s === cur.seed) return;
    changeCards({ seed: s }, true);
    $('seed-msg').textContent = T.seedApplied;
  });

  $('btn-save-shared').addEventListener('click', function () {
    if (saved && saved.seed !== cur.seed && !window.confirm(T.sharedOverwrite(saved.seed))) return;
    shared = null;
    persist();
    history.replaceState(null, '', location.pathname);
    renderForm();
    $('share-msg').textContent = T.sharedSaved;
  });

  $('btn-print').addEventListener('click', function () {
    persist();
    window.print();
  });
  $('btn-share').addEventListener('click', function () {
    persist();
    var url = location.href.split('#')[0] + C.encodeShare(cur);
    K.copyText(url).then(function () { $('share-msg').textContent = T.shareCopied; }, function () {
      history.replaceState(null, '', url);
      $('share-msg').textContent = T.shareFailed;
    });
  });

  // 共有リンクを貼りかえて開き直したとき
  window.addEventListener('hashchange', function () {
    var s = C.decodeShare(location.hash);
    if (!s) return;
    shared = s;
    cur = Object.assign({ credit: cur.credit }, s);
    render();
  });

  K.wireBackup(function () {
    saved = K.loadAll().cards;
    if (!shared && saved) cur = saved;
    render();
  });

  render();
  K.registerSW();
})();
