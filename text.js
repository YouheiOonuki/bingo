// ===========================
// 大人数ビンゴ抽選 — 画面に JS から出す文（すべてここに集める）
// 英語版などを足すときは TEXTS に言語を足し、<html lang> で選ぶ。HTML に直接書いた文は各 HTML にある
// ブラウザでは window.TEXT、Node（テスト）では module.exports
// ===========================
(function (root) {
  'use strict';

  var ja = {
    // 読み上げ（speechSynthesis）。言語ごとに声・列の文字の読み・数の言い方を持つ
    speech: {
      lang: 'ja-JP',
      letters: { B: 'ビー', I: 'アイ', N: 'エヌ', G: 'ジー', O: 'オー' },
      /** 1 個分の読み上げ。letter は '' のことがある（番号札の抽選など） */
      one: function (n, letter) { return letter ? this.letters[letter] + 'の、' + n : n + '番'; },
      join: '、',
      bingo: 'ビンゴです',
    },

    // 抽選
    count: function (n, rest) { return n + ' 個目・残り ' + rest; },
    countDone: function (n) { return n + ' 個すべて出ました'; },
    draw: '数字を引く',
    drawSkip: 'すぐ出す',
    drawDone: 'すべて出ました',
    announce: function (list) { return '出た数：' + list.join('、'); },
    numberLabel: function (n, letter) { return letter ? letter + ' ' + n : String(n); },
    recent: function (list) { return '最近：' + list.join(' → '); },
    recentNone: 'まだ出ていません',
    undoConfirm: function (label) { return '最後に出た「' + label + '」を取り消しますか？'; },
    resetConfirm: '出た数と、景品の当たった人の記入を消して、はじめからにします。景品の名前とカードはそのまま残ります。よろしいですか？',
    fullOn: '全画面',
    fullOff: '全画面をやめる',
    setStatus: function (b, r, total) { return 'ビンゴ ' + b + ' 枚・リーチ ' + r + ' 枚（カード ' + total + ' 枚のうち）'; },
    nextPrize: function (name, i, total) { return '次の景品（' + i + '/' + total + '）：' + name; },
    prizesDone: '景品はすべて渡しました',
    boardCaption: '出た数の一覧',

    // 照合
    checkReason: {
      empty: 'カード番号を入れてください。',
      format: 'カード番号の形がちがいます。カードの下の「No.」（例：KR-042）か、番号だけ（例：42）を入れてください。',
      otherSet: '別のカードの組の番号です。カードの印刷ページで、配ったカードと同じ組（カードの組の番号）になっているか確かめてください。',
      range: function (count) { return 'この組のカードは No.1〜' + count + ' です。'; },
    },
    checkBingo: function (id, at, label, lines) { return 'No.' + id + ' はビンゴです（' + at + ' 個目の「' + label + '」でそろいました' + (lines > 1 ? '。そろった線 ' + lines + ' 本' : '') + '）'; },
    checkNot: function (id, reach) { return 'No.' + id + ' はまだビンゴではありません' + (reach > 0 ? '（リーチ ' + reach + ' 本）' : '') + '。'; },
    checkRangeWarn: function (cmax, gmin, gmax) { return 'カードは 1〜' + cmax + ' 用ですが、抽選は ' + gmin + '〜' + gmax + ' です。範囲を合わせてください。'; },
    checkAlready: function (prize) { return 'このカードは「' + prize + '」をもう受け取っています。'; },
    giveNext: function (name) { return 'この人に次の景品を渡す（' + name + '）'; },
    free: 'FREE',

    // 景品
    prizeWinner: '当たった人',
    prizeUp: '上へ',
    prizeDown: '下へ',
    prizeDelete: '消す',
    prizeDeleteConfirm: function (name) { return '「' + name + '」を消しますか？'; },
    prizeUnnamed: '（名前なし）',
    prizeFull: function (max) { return '景品は ' + max + ' 個までです。'; },

    // 時間の目安
    estimate: function (o) {
      var min = function (s) { return s < 60 ? Math.max(1, Math.round(s)) + ' 秒' : '約 ' + Math.round(s / 60) + ' 分'; };
      var lines = [
        '景品 ' + o.prizes + ' 個分のビンゴが出るまでに、数をだいたい ' + o.p10 + '〜' + o.p90 + ' 個引きます（まん中は ' + o.median + ' 個）。',
      ];
      o.rows.forEach(function (r) {
        lines.push('1 回に ' + r.per + ' 個ずつ引くと ' + r.times + ' 回、' + min(r.times * o.sec) + (r.per === o.current ? '（今の設定）' : ''));
      });
      if (o.fromSet) lines.push('印刷したカード ' + o.people + ' 枚で数えました。');
      if (o.prizes >= o.people) lines.push('景品が人数より多いので、全員がビンゴになるまでの目安です。');
      return lines;
    },
    estimateBusy: '数えています…',

    // まとめ
    summary: function (o) {
      var lines = [o.date + ' のビンゴ', '引いた数：' + o.count + ' 個（' + o.range + '）'];
      if (o.prizes.length) {
        lines.push('', '景品と当たった人：');
        o.prizes.forEach(function (p, i) { lines.push((i + 1) + '. ' + (p.name || ja.prizeUnnamed) + '　' + (p.winner || '―')); });
      }
      lines.push('', '出た順：' + o.order.join(', '));
      return lines.join('\n');
    },
    copied: 'コピーしました。',
    copyFailed: 'コピーできませんでした。上の文を選んでコピーしてください。',

    // カード
    cardsNone: 'カードはまだ作っていません。',
    cardsSummary: function (o) { return 'カード ' + o.count + ' 枚（1〜' + o.max + '、カードの組の番号 ' + o.seed + '、No. の頭 ' + o.tag + '）。照合はこの組で行います。'; },
    tagNote: function (tag) { return '（No. の頭：' + tag + '）'; },
    cardNo: function (id) { return 'No.' + id; },
    cardCredit: 'yorozu-craft.com/bingo/print/ で作成',
    sheetInfo: function (count, pages, per) { return count + ' 枚・A4 ' + pages + ' ページ（1 ページに ' + per + ' 枚）'; },
    newSeedConfirm: '別のカードの組にします。もう印刷して配ったカードがあるときは、照合できなくなります。よろしいですか？',
    seedInvalid: 'カードの組の番号は 6 文字です（0・1・I・O は使いません）。',
    seedApplied: 'カードの組の番号を変えました。',
    shareCopied: 'リンクをコピーしました。もう 1 人の幹事に送ると、同じカードを印刷・照合できます。',
    shareFailed: 'コピーできませんでした。アドレス欄のリンクをコピーしてください。',
    sharedBanner: function (o) { return '共有されたカードの設定です（' + o.count + ' 枚、カードの組の番号 ' + o.seed + '）。この端末で照合に使うには「この設定を保存する」を押してください。'; },
    sharedSaved: '保存しました。抽選画面の照合で、このカードを確かめられます。',
    sharedOverwrite: function (seed) { return 'この端末にはカードの組 ' + seed + ' が保存されています。共有された設定で置き換えますか？'; },

    // バックアップ（README「ツールを追加するとき」20）
    backupExported: 'ファイルに書き出しました。別の端末では、このファイルを移して「ファイルから読み込む」を押してください。',
    backupTooBig: 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。',
    backupConfirm: 'ファイルの内容で、今の抽選・景品・カードの設定を置き換えます。よろしいですか？',
    backupImported: 'ファイルから読み込みました。',
    backupUnreadable: 'ファイルを読み取れませんでした。',
    backupError: {
      unreadable: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。',
      otherTool: function (tool) { return 'ほかのツール（' + tool + '）のファイルです。このツールで書き出したファイルを選んでください。'; },
      newer: '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。',
      format: 'ファイルの形式が正しくないため読み込めません。',
      missing: 'ファイルの中身が足りないため読み込めません。',
    },
  };

  var TEXTS = { ja: ja };
  var lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'ja').slice(0, 2) : 'ja';
  var api = TEXTS[lang] || ja;
  api.all = TEXTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TEXT = api;
})(this);
