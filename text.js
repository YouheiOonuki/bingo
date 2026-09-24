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
      sayLetter: false,   // 列の文字も言うか（設定で変えていないときの既定）。日本語は数だけ
    },

    // 抽選
    count: function (n, rest) { return n + ' 個目・残り ' + rest; },
    countDone: function (n) { return n + ' 個すべて出ました'; },
    draw: '数字を引く',
    drawSkip: 'すぐ出す',
    drawDone: 'すべて出ました',
    announce: function (list) { return '出た数：' + list.join('、'); },
    numberLabel: function (n, letter) { return letter ? letter + ' ' + n : String(n); },
    batchJoin: '　',   // 1 回に 2 個以上引いたときの並べ方
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
    rangeLabel: function (min, max) { return min + '〜' + max; },
    date: function (d) { return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); },

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
    prizeState: function (n) { return n ? n + ' 個' : 'なし'; },
    prizeWinner: '当たった人',
    prizeWinnerLabel: function (i) { return '当たった人（' + i + '）'; },
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
    sheetInfo: function (count, pages, per, paper) { return count + ' 枚・' + this.paperName[paper] + ' ' + pages + ' ページ（1 ページに ' + per + ' 枚）'; },
    paperDefault: 'a4',   // 用紙（設定で変えていないときの既定）
    paperName: { a4: 'A4', letter: 'レター' },
    optCards: function (o) { return '見出し ' + (o.title ? 'あり' : 'なし') + '・クレジット ' + (o.credit ? 'あり' : 'なし') + '・' + this.paperName[o.paper]; },
    previewAll: function (pages) { return 'すべてのページを見る（' + pages + ' ページ）'; },
    previewOne: '1 ページ目だけ見る',
    fixbarInfo: function (count, pages) { return count + ' 枚・' + pages + ' ページ'; },
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

  // ---------------------------------------------------------------
  // English（/bingo/en/）。US の 75 ボールの呼び方（"B 12"）を既定にする
  // ---------------------------------------------------------------
  var en = {
    speech: {
      lang: 'en-US',
      letters: { B: 'B', I: 'I', N: 'N', G: 'G', O: 'O' },
      one: function (n, letter) { return letter ? letter + ' ' + n : String(n); },
      join: ', ',
      bingo: 'Bingo!',
      sayLetter: true,   // US callers say the letter ("B 12")
    },

    count: function (n, rest) { return n + ' drawn · ' + rest + ' left'; },
    countDone: function (n) { return 'All ' + n + ' numbers drawn'; },
    draw: 'Draw',
    drawSkip: 'Show now',
    drawDone: 'All drawn',
    announce: function (list) { return 'Drawn: ' + list.join(', '); },
    numberLabel: function (n, letter) { return letter ? letter + ' ' + n : String(n); },
    batchJoin: '   ',
    recent: function (list) { return 'Recent: ' + list.join(' → '); },
    recentNone: 'Nothing drawn yet',
    undoConfirm: function (label) { return 'Undo the last number (' + label + ')?'; },
    resetConfirm: 'Clear the drawn numbers and prize winners and start over? Prize names and cards stay.',
    fullOn: 'Full screen',
    fullOff: 'Exit full screen',
    setStatus: function (b, r, total) { return 'Bingo: ' + b + ' · One away: ' + r + ' (of ' + total + ' cards)'; },
    nextPrize: function (name, i, total) { return 'Next prize (' + i + '/' + total + '): ' + name; },
    prizesDone: 'All prizes given',
    boardCaption: 'Numbers drawn',
    rangeLabel: function (min, max) { return min + '–' + max; },
    date: function (d) { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); },

    checkReason: {
      empty: 'Enter a card number.',
      format: 'That is not a card number. Enter the "No." under the card (e.g. KR-042) or just the number (e.g. 42).',
      otherSet: 'This number belongs to a different card set. Check that the card set code on the card page matches the cards you handed out.',
      range: function (count) { return 'Cards in this set are No.1–' + count + '.'; },
    },
    checkBingo: function (id, at, label, lines) { return 'No.' + id + ' has bingo (completed by number ' + at + ', ' + label + (lines > 1 ? '; ' + lines + ' lines' : '') + ').'; },
    checkNot: function (id, reach) { return 'No.' + id + ' has no bingo yet' + (reach > 0 ? ' (' + reach + ' line' + (reach > 1 ? 's' : '') + ' one away)' : '') + '.'; },
    checkRangeWarn: function (cmax, gmin, gmax) { return 'The cards are 1–' + cmax + ' but the draw is ' + gmin + '–' + gmax + '. Match the ranges.'; },
    checkAlready: function (prize) { return 'This card already received "' + prize + '".'; },
    giveNext: function (name) { return 'Give this player the next prize (' + name + ')'; },
    free: 'FREE',

    prizeState: function (n) { return n ? n + (n > 1 ? ' prizes' : ' prize') : 'none'; },
    prizeWinner: 'Winner',
    prizeWinnerLabel: function (i) { return 'Winner (' + i + ')'; },
    prizeUp: 'Move up',
    prizeDown: 'Move down',
    prizeDelete: 'Delete',
    prizeDeleteConfirm: function (name) { return 'Delete "' + name + '"?'; },
    prizeUnnamed: '(no name)',
    prizeFull: function (max) { return 'Up to ' + max + ' prizes.'; },

    estimate: function (o) {
      var min = function (s) { return s < 60 ? Math.max(1, Math.round(s)) + ' sec' : 'about ' + Math.round(s / 60) + ' min'; };
      var lines = [
        'To get ' + o.prizes + ' bingo' + (o.prizes > 1 ? 's' : '') + ', you draw about ' + o.p10 + '–' + o.p90 + ' numbers (median ' + o.median + ').',
      ];
      o.rows.forEach(function (r) {
        lines.push(r.per + ' per draw: ' + r.times + ' draws, ' + min(r.times * o.sec) + (r.per === o.current ? ' (current setting)' : ''));
      });
      if (o.fromSet) lines.push('Counted with your ' + o.people + ' printed cards.');
      if (o.prizes >= o.people) lines.push('There are more prizes than players, so this is the time until every card has bingo.');
      return lines;
    },
    estimateBusy: 'Counting…',

    summary: function (o) {
      var lines = ['Bingo on ' + o.date, 'Numbers drawn: ' + o.count + ' (' + o.range + ')'];
      if (o.prizes.length) {
        lines.push('', 'Prizes and winners:');
        o.prizes.forEach(function (p, i) { lines.push((i + 1) + '. ' + (p.name || en.prizeUnnamed) + ' - ' + (p.winner || '-')); });
      }
      lines.push('', 'Order drawn: ' + o.order.join(', '));
      return lines.join('\n');
    },
    copied: 'Copied.',
    copyFailed: 'Could not copy. Select the text above and copy it.',

    cardsNone: 'No cards yet.',
    cardsSummary: function (o) { return o.count + ' cards (1–' + o.max + ', card set code ' + o.seed + ', No. prefix ' + o.tag + '). Card checks use this set.'; },
    tagNote: function (tag) { return ' (No. prefix: ' + tag + ')'; },
    cardNo: function (id) { return 'No.' + id; },
    cardCredit: 'Made at yorozu-craft.com/bingo/en/print/',
    sheetInfo: function (count, pages, per, paper) { return count + ' cards · ' + pages + ' ' + this.paperName[paper] + ' page' + (pages > 1 ? 's' : '') + ' (' + per + ' per page)'; },
    paperDefault: 'letter',
    paperName: { a4: 'A4', letter: 'Letter' },
    optCards: function (o) { return 'title ' + (o.title ? 'on' : 'off') + ', credit ' + (o.credit ? 'on' : 'off') + ', ' + this.paperName[o.paper]; },
    previewAll: function (pages) { return 'Show all ' + pages + ' pages'; },
    previewOne: 'Show page 1 only',
    fixbarInfo: function (count, pages) { return count + ' cards · ' + pages + ' page' + (pages > 1 ? 's' : ''); },
    newSeedConfirm: 'Switch to a different card set? Cards you already printed and handed out can no longer be checked.',
    seedInvalid: 'A card set code has 6 characters (no 0, 1, I or O).',
    seedApplied: 'Card set changed.',
    shareCopied: 'Link copied. Send it to a co-host so they can print and check the same cards.',
    shareFailed: 'Could not copy. Copy the link from the address bar.',
    sharedBanner: function (o) { return 'These are shared card settings (' + o.count + ' cards, card set code ' + o.seed + '). To check cards on this device, press "Save these settings".'; },
    sharedSaved: 'Saved. You can now check these cards on the caller page.',
    sharedOverwrite: function (seed) { return 'This device has card set ' + seed + ' saved. Replace it with the shared settings?'; },

    backupExported: 'Exported. On another device, move the file there and press "Import from file".',
    backupTooBig: 'The file is too large. Choose a file exported by this tool.',
    backupConfirm: 'Replace the current draw, prizes and card settings with the file contents?',
    backupImported: 'Imported from file.',
    backupUnreadable: 'Could not read the file.',
    backupError: {
      unreadable: 'Could not read the file. Choose a .json file made with "Export to file" in this tool.',
      otherTool: function (tool) { return 'This file is from another tool (' + tool + '). Choose a file exported by this tool.'; },
      newer: 'This file was exported by a newer version of the tool. Reload the page and try again.',
      format: 'The file format is not valid.',
      missing: 'The file is missing data.',
    },
  };

  var TEXTS = { ja: ja, en: en };
  var lang = typeof document !== 'undefined' ? (document.documentElement.lang || 'ja').slice(0, 2) : 'ja';
  var api = TEXTS[lang] || ja;
  api.all = TEXTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TEXT = api;
})(this);
