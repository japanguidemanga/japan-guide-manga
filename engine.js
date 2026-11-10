/* MangaEngine — 脚本データ(JSON)から6コマ漫画のSVGを組み立てるレンダラー。
 * DOMに依存しない純粋関数なので、ブラウザでもNode(ヘッドレス書き出し)でも同じ結果になる。
 *   MangaEngine.renderPanel(panel, {lang, cast, accent})  -> SVG文字列
 *   MangaEngine.validate(manga)                           -> 警告の配列
 *   MangaEngine.catalog()                                 -> 脚本で使える部品の一覧
 */
(function (root) {
  'use strict';
  const W = 400, H = 320, FLOOR = 308, INK = '#24262c';
  const FONT = "'Zen Maru Gothic','Noto Sans TC','Noto Sans KR','Hiragino Maru Gothic ProN','Yu Gothic UI','Meiryo',sans-serif";
  const SLOTS = { L: 82, LC: 140, C: 200, RC: 260, R: 318 };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  const T = (x, y, txt, size, fill, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-family="${FONT}" font-weight="700" ${extra}>${esc(txt)}</text>`;
  const VT = (x, y, txt, size, fill) => [...txt].map((ch, i) => T(x, y + i * size * 1.15, ch, size, fill, 'text-anchor="middle"')).join('');
  const SK = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 文字は { ja, en, zh, ko, es, pt } のように言語ごとに持つ。訳がない言語は英語（英語もなければ日本語）で表示
  const pick = (o, ctx) => (o == null ? '' : typeof o === 'string' ? o : (o[ctx.lang] ?? (ctx.lang === 'ja' ? (o.ja ?? o.en) : (o.en ?? o.ja)) ?? ''));
  // 1文字ずつ幅をとる言語（日本語・中国語・韓国語）
  const CJK = l => l === 'ja' || l === 'zh' || l === 'ko';

  /* ---------- 文字の折り返し（日本語は禁則処理つき） ---------- */
  const NO_START = '、。，．！？!?）」』ー〜～…っゃゅょァィゥェォッャュョ・ ';
  function units(s) {
    let u = 0;
    for (const ch of s) u += /[\x20-\x7e -ɏ]/.test(ch) ? (/[A-Z@%WMmÀ-Þ]/.test(ch) ? 0.68 : 0.52) : 1;
    return u;
  }
  function wrap(text, max) {
    const lines = [];
    for (const para of String(text ?? '').split('\n')) {
      // 欧文（アクセント付き含む）と韓国語は単語ごと、日本語・中国語は1文字ごとに折り返す
      const toks = para.match(/[¡¿]?[A-Za-z0-9À-ɏ'’.,!?%°:;()\-]+ ?|[가-힣]+[.,!?…~]* ?|\s+|[^\sA-Za-z0-9]/gu) || [];
      let line = '';
      for (const tk of toks) {
        const cand = line + tk;
        if (units(cand.trimEnd()) > max && line.trim()) {
          if ([...tk].length === 1 && NO_START.includes(tk)) { line = cand; continue; }
          lines.push(line.trimEnd());
          line = tk.trimStart();
        } else line = cand;
      }
      if (line.trim()) lines.push(line.trimEnd());
    }
    return lines;
  }

  /* ---------- 背景 ---------- */
  const floor = (y, c) => R(0, y, W, H - y, c) + `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#00000022" stroke-width="2"/>`;
  const cloud = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})" fill="#fff" opacity=".92"><ellipse cx="0" cy="0" rx="26" ry="11"/><ellipse cx="14" cy="-7" rx="16" ry="11"/><ellipse cx="-12" cy="-5" rx="12" ry="9"/></g>`;
  const tree = (x, y, s = 1, c = '#7fae7a') => `<g transform="translate(${x},${y}) scale(${s})"><rect x="-5" y="0" width="10" height="44" fill="#8b6a4a"/><circle cx="0" cy="-12" r="30" fill="${c}"/><circle cx="-22" cy="6" r="20" fill="${c}"/><circle cx="22" cy="6" r="20" fill="${c}"/></g>`;
  const COLORS = ['#e8735a', '#f2c14e', '#7cc2e8', '#9bd17f', '#c792ea', '#f49ac1'];
  function shelfItems(x, y, n, w = 16, h = 24, gap = 21) {
    let s = '';
    for (let i = 0; i < n; i++) s += R(x + i * gap, y, w, h, COLORS[(i * 7 + y) % COLORS.length], 'rx="3"');
    return s;
  }
  function burst(cx, cy, n, col) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a1 = (i / n) * Math.PI * 2, a2 = ((i + 0.42) / n) * Math.PI * 2;
      s += `<path d="M${cx},${cy} L${(cx + 600 * Math.cos(a1)).toFixed(1)},${(cy + 600 * Math.sin(a1)).toFixed(1)} L${(cx + 600 * Math.cos(a2)).toFixed(1)},${(cy + 600 * Math.sin(a2)).toFixed(1)} Z" fill="${col}"/>`;
    }
    return s;
  }
  const counter = (c, top) => R(0, 236, W, 84, c, `stroke="${INK}" stroke-width="2"`) + R(0, 230, W, 9, top, `stroke="${INK}" stroke-width="2"`);
  const stripes = () => R(0, 56, W, 6, '#3a8fd6') + R(0, 62, W, 6, '#56b36b') + R(0, 68, W, 6, '#f08a3c');

  const SCENES = {
    plain: () => ({ bg: R(0, 0, W, H, '#f6f6f3') + `<g fill="#e4e4de">${Array.from({ length: 160 }, (_, i) => `<circle cx="${(i % 20) * 21 + ((i / 20 | 0) % 2) * 10}" cy="${(i / 20 | 0) * 21 + 80}" r="2.2"/>`).join('')}</g>` }),
    impact: () => ({ bg: R(0, 0, W, H, '#fff') + burst(200, 190, 44, '#d8dce4') + `<ellipse cx="200" cy="200" rx="135" ry="105" fill="#fff"/>` }),
    airport: () => ({
      bg: R(0, 0, W, H, '#e4edf4') + R(24, 58, 352, 150, '#bfe1f4', 'stroke="#8ea4b5" stroke-width="5"') +
        [112, 200, 288].map(x => `<line x1="${x}" y1="58" x2="${x}" y2="208" stroke="#8ea4b5" stroke-width="4"/>`).join('') +
        cloud(80, 100) + cloud(330, 90, .8) +
        `<g transform="translate(225,140)" fill="#fff" stroke="#8ea4b5" stroke-width="2"><path d="M-80,0 Q-80,-12 -60,-12 L60,-12 Q85,-12 92,0 Q85,10 60,10 L-60,10 Q-80,10 -80,0Z"/><path d="M-10,0 L-40,32 L-20,32 L20,0Z"/><path d="M-62,-10 L-78,-34 L-64,-34 L-46,-10Z"/></g>` +
        floor(250, '#cfd6dd') + R(268, 216, 112, 26, '#f2c94c', `rx="3" stroke="${INK}" stroke-width="1.5"`) + T(324, 234, '到着 Arrivals', 12, INK, 'text-anchor="middle"')
    }),
    platform: () => ({
      bg: R(0, 0, W, H, '#dcecf5') + R(0, 40, W, 22, '#8f99a3') + R(330, 62, 12, 190, '#a6afb7') +
        R(-10, 96, 230, 154, '#eef0f2', `rx="10" stroke="${INK}" stroke-width="2"`) +
        [10, 80, 150].map(x => R(x, 114, 52, 48, '#a9d3ea', `rx="4" stroke="${INK}" stroke-width="1.5"`)).join('') +
        R(-10, 190, 230, 10, '#3c9a5a') + R(236, 94, 140, 40, '#22252b', 'rx="4"') +
        T(306, 120, '8:00  普通 Local', 13, '#ffb347', 'text-anchor="middle"') +
        floor(250, '#c4c4c4') + R(0, 256, W, 9, '#f1c533') +
        [230, 300, 370].map(x => `<path d="M${x},282 l10,10 l10,-10" fill="none" stroke="#f1c533" stroke-width="4"/>`).join('')
    }),
    train: () => ({
      bg: R(0, 0, W, H, '#eef1ea') + [14, 145, 276].map(x => R(x, 96, 110, 70, '#bfe3f2', 'stroke="#9aa59c" stroke-width="4"') +
        R(x + 10, 132, 18, 34, '#9cc0d2') + R(x + 34, 120, 22, 46, '#a9c9d9') + R(x + 64, 138, 30, 28, '#9cc0d2')).join('') +
        `<line x1="0" y1="64" x2="400" y2="64" stroke="#9aa59c" stroke-width="4"/>` +
        [40, 90, 140, 190, 240, 290, 340, 390].map(x => `<line x1="${x}" y1="64" x2="${x}" y2="80" stroke="#b5b5b5" stroke-width="3"/><circle cx="${x}" cy="88" r="7" fill="none" stroke="#c8c8c8" stroke-width="3"/>`).join('') +
        R(0, 184, W, 30, '#6aa06e') + R(0, 212, W, 22, '#58905c') + floor(262, '#cbc4b6')
    }),
    konbini: () => ({
      bg: R(0, 0, W, H, '#f4f7f8') + stripes() +
        [96, 140, 184].map(y => shelfItems(22, y + 8, 11) + R(16, y + 34, 236, 6, '#b9c2c8')).join('') +
        R(266, 84, 122, 170, '#d6ecf5', 'stroke="#9fb6c2" stroke-width="4"') +
        [110, 150, 190, 230].map(y => shelfItems(274, y - 22, 5, 12, 22, 21) + R(268, y, 118, 3, '#9fb6c2')).join('') +
        floor(254, '#e3e5e6')
    }),
    register: () => ({
      bg: R(0, 0, W, H, '#f4f7f8') + stripes() + R(20, 90, 360, 90, '#e7ebee', 'rx="4"') +
        [100, 140].map(y => shelfItems(30, y, 16, 14, 26, 21.5)).join(''),
      fg: counter('#d4dbe1', '#b8c3cc') + R(250, 194, 70, 38, '#3d434d', 'rx="4"') + R(258, 200, 30, 14, '#8fe3b0') +
        R(140, 196, 72, 36, '#f5e7c8', `stroke="${INK}" stroke-width="1.5"`) +
        [156, 176, 196].map(x => `<ellipse cx="${x}" cy="218" rx="8" ry="6" fill="#d8963a"/>`).join(''),
      behindDy: -34
    }),
    street: () => ({
      bg: R(0, 0, W, H, '#dbeef9') + cloud(60, 64) + cloud(250, 52, .7) +
        R(10, 80, 110, 170, '#e9d8c4', `stroke="#c9b49c" stroke-width="2"`) +
        [100, 140, 180].map(y => [24, 58].map(x => R(x, y, 24, 22, '#bcdcef')).join('')).join('') +
        R(132, 60, 92, 190, '#cfd9e2', `stroke="#aab7c2" stroke-width="2"`) +
        [80, 120, 160, 200].map(y => R(146, y, 64, 20, '#a9cfe6')).join('') +
        R(236, 104, 76, 146, '#f0e0e6', `stroke="#d4bcc5" stroke-width="2"`) + R(248, 190, 52, 60, '#8a6d5a') +
        R(98, 96, 24, 92, '#d9473a', `stroke="${INK}" stroke-width="1.5"`) + VT(110, 114, 'ラーメン', 15, '#fff') +
        R(206, 82, 22, 46, '#2d6fb8', `stroke="${INK}" stroke-width="1.5"`) + VT(217, 110, '薬', 16, '#fff') +
        R(322, 124, 62, 126, '#d94b3f', `rx="4" stroke="${INK}" stroke-width="2"`) + R(330, 134, 46, 52, '#f4f7fa') +
        [140, 160].map(y => shelfItems(334, y, 4, 7, 14, 11)).join('') + R(358, 200, 14, 22, '#2b2b2b') +
        floor(250, '#d9d9d6') + `<line x1="0" y1="290" x2="400" y2="290" stroke="#00000014" stroke-width="2"/>`
    }),
    ticket: () => ({
      bg: R(0, 0, W, H, '#d6b48a') + [30, 70, 110, 150, 190, 230].map(y => `<line x1="0" y1="${y}" x2="400" y2="${y + 6}" stroke="#c49e72" stroke-width="2"/>`).join('') +
        R(240, 128, 136, 122, '#5b3f2a') + R(228, 62, 160, 66, '#22335a') +
        [268, 308, 348].map(x => R(x - 1, 94, 3, 34, '#d6b48a')).join('') + T(308, 90, 'らーめん', 19, '#fff', 'text-anchor="middle"') +
        R(28, 76, 150, 178, '#ececec', `rx="8" stroke="${INK}" stroke-width="2"`) + R(28, 76, 150, 22, '#d9473a', `rx="6"`) +
        T(103, 92, '食券 Tickets', 12, '#fff', 'text-anchor="middle"') +
        [0, 1, 2, 3].map(r => [0, 1, 2].map(c => R(38 + c * 46, 106 + r * 30, 40, 24, COLORS[(r * 3 + c) % 6], `rx="4" stroke="${INK}" stroke-width="1"`) +
          `<circle cx="${50 + c * 46}" cy="${118 + r * 30}" r="7" fill="#fff" opacity=".8"/>`).join('')).join('') +
        R(146, 230, 20, 6, INK) + floor(254, '#8c6a4a')
    }),
    ramen: () => ({
      behindAll: true, behindDy: -30,
      bg: R(0, 0, W, H, '#f1e2c6') +
        ['醤油', '味噌', '塩', '豚骨', '餃子', '替玉', '大盛', 'ビール', '炒飯'].map((t, i) => R(24 + i * 42, 62, 30, 74, '#fff7e3', 'stroke="#b98b52" stroke-width="2"') + VT(39 + i * 42, 80, t, 12, '#5b3a1e')).join('') +
        R(0, 150, W, 90, '#cdd6d9') + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${i * 50}" y1="150" x2="${i * 50}" y2="240" stroke="#b6c1c4"/>`).join(''),
      fg: counter('#b5773f', '#8a5328')
    }),
    onsen: () => ({
      behindAll: true,
      bg: R(0, 0, W, H, '#d4e8ef') + `<path d="M0,140 L80,80 L150,130 L230,70 L320,128 L400,96 L400,200 L0,200Z" fill="#a7c7a0"/>` +
        R(0, 128, W, 110, '#cdb47c') + Array.from({ length: 29 }, (_, i) => `<line x1="${i * 14}" y1="128" x2="${i * 14}" y2="238" stroke="#b39a63" stroke-width="2"/>`).join('') +
        R(0, 124, W, 8, '#9c8350') + [30, 110, 300, 370].map((x, i) => `<ellipse cx="${x}" cy="240" rx="${30 + i * 4}" ry="16" fill="#9aa0a3" stroke="${INK}" stroke-width="1.5"/>`).join(''),
      fg: R(0, 246, W, 74, '#8fcfdf', 'opacity=".94"') + `<line x1="0" y1="246" x2="400" y2="246" stroke="#5aa8bd" stroke-width="2"/>` +
        [[40, 270], [150, 290], [280, 268], [350, 296]].map(([x, y]) => `<path d="M${x - 18},${y} q9,-5 18,0 t18,0" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/>`).join('') +
        `<ellipse cx="380" cy="300" rx="40" ry="20" fill="#9aa0a3" stroke="${INK}" stroke-width="1.5"/>`
    }),
    washarea: () => ({
      bg: R(0, 0, W, H, '#e3eef0') + Array.from({ length: 17 }, (_, i) => `<line x1="${i * 24}" y1="0" x2="${i * 24}" y2="262" stroke="#cfdfe2"/>`).join('') +
        Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 24}" x2="400" y2="${i * 24}" stroke="#cfdfe2"/>`).join('') +
        [20, 155, 290].map(x => R(x, 92, 90, 60, '#d5eaf5', `rx="4" stroke="${INK}" stroke-width="1.5"`) + `<circle cx="${x + 45}" cy="176" r="8" fill="#b0b8bc" stroke="${INK}" stroke-width="1.5"/>` +
          R(x + 25, 240, 40, 12, '#e9a65e', `rx="3" stroke="${INK}" stroke-width="1.5"`) + R(x + 30, 252, 6, 12, '#c9884a') + R(x + 54, 252, 6, 12, '#c9884a') +
          `<path d="M${x + 70},226 L${x + 88},226 L${x + 85},250 L${x + 73},250Z" fill="#e8c88f" stroke="${INK}" stroke-width="1.5"/>`).join('') +
        floor(262, '#c9d6da')
    }),
    toilet: () => ({
      bg: R(0, 0, W, H, '#eef3f0') + Array.from({ length: 17 }, (_, i) => `<line x1="${i * 24}" y1="170" x2="${i * 24}" y2="280" stroke="#d7e2dc"/>`).join('') +
        R(0, 168, W, 3, '#cfdcd4') + R(150, 80, 70, 50, '#cfe8f2', `stroke="#a9b8b0" stroke-width="3"`) +
        R(222, 150, 60, 54, '#fff', `rx="6" ${SK}`) +
        `<path d="M206,206 L298,206 Q300,242 272,254 L264,282 L236,282 L228,254 Q204,242 206,206Z" fill="#fff" ${SK}/>` +
        `<ellipse cx="252" cy="206" rx="48" ry="9" fill="#f3f3f3" ${SK}/>` +
        R(304, 186, 30, 46, '#e8e2d4', `rx="4" ${SK}`) + [196, 206, 216].map(y => `<circle cx="319" cy="${y}" r="3" fill="#7fb2d6"/>`).join('') +
        `<circle cx="180" cy="214" r="13" fill="#fff" ${SK}/>` + floor(280, '#d6dcd8')
    }),
    room: () => ({
      bg: R(0, 0, W, H, '#efe8de') + R(250, 70, 120, 90, '#bfe0f2', 'stroke="#b7a990" stroke-width="5"') +
        R(262, 118, 20, 42, '#9cb5c8') + R(290, 104, 26, 56, '#a9c0d1') + R(326, 124, 30, 36, '#9cb5c8') +
        R(10, 150, 40, 110, '#a58463', `rx="4" ${SK}`) + R(10, 200, 230, 60, '#fff', SK) + R(10, 214, 230, 46, '#9cb7d6', SK) +
        R(56, 188, 54, 20, '#fff', `rx="8" ${SK}`) + floor(260, '#c9b79c')
    }),
    ryokan: () => ({
      bg: R(0, 0, W, H, '#f6f3ea') + [40, 80, 120, 160, 200].map(y => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#c9a77a" stroke-width="2"/>`).join('') +
        Array.from({ length: 11 }, (_, i) => `<line x1="${i * 40}" y1="40" x2="${i * 40}" y2="240" stroke="#c9a77a" stroke-width="2"/>`).join('') +
        R(0, 36, W, 6, '#8a6a46') + R(30, 64, 46, 140, '#fbf6e8', `stroke="${INK}" stroke-width="1.5"`) +
        `<circle cx="53" cy="112" r="15" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="80 20"/>` +
        R(0, 240, W, 80, '#cfd59a') + [100, 200, 300].map(x => `<line x1="${x}" y1="240" x2="${x}" y2="320" stroke="#a9ae72" stroke-width="2"/>`).join('') +
        `<line x1="0" y1="280" x2="400" y2="280" stroke="#a9ae72" stroke-width="2"/>`
    }),
    koban: () => ({
      bg: R(0, 0, W, H, '#dcecf5') + cloud(340, 40, .8) + tree(36, 200, .9) + tree(372, 206, .8) +
        R(90, 72, 240, 178, '#ece6d8', 'stroke="#b0a58d" stroke-width="3"') + R(80, 62, 260, 16, '#6c6f74') +
        R(146, 84, 128, 28, '#fff', `rx="3" ${SK}`) + T(210, 104, '交番 KOBAN', 15, '#1f3c78', 'text-anchor="middle"') +
        `<circle cx="210" cy="52" r="9" fill="#e0413a" ${SK}/>` + R(176, 126, 70, 124, '#cde3ef', SK) + R(102, 126, 50, 56, '#cde3ef', SK) +
        floor(250, '#d6d6d3')
    }),
    shrine: () => ({
      bg: R(0, 0, W, H, '#e2efe4') + tree(30, 196, 1.2, '#6a9a66') + tree(372, 190, 1.3, '#6a9a66') + tree(64, 214, .9) + tree(340, 220, .9) +
        R(0, 250, W, 70, '#e0d9c8') + R(150, 250, 100, 70, '#cfc7b4') +
        R(108, 92, 14, 160, '#d6442f', SK) + R(278, 92, 14, 160, '#d6442f', SK) + R(96, 120, 208, 10, '#d6442f', SK) +
        R(84, 92, 232, 10, '#d6442f', SK) + `<path d="M66,80 Q200,68 334,80 L330,94 Q200,84 70,94Z" fill="#2f2a2a"/>` + R(192, 102, 16, 18, '#d6442f', SK)
    }),
    chozuya: () => ({
      bg: R(0, 0, W, H, '#e2efe4') + tree(30, 190, 1.1, '#6a9a66') + tree(376, 196, 1.1, '#6a9a66') +
        `<path d="M60,84 L340,84 L306,58 L94,58Z" fill="#6d4a33" ${SK}/>` + R(84, 84, 10, 170, '#8b5e3c') + R(306, 84, 10, 170, '#8b5e3c') +
        R(96, 196, 208, 50, '#a3a8ab', `rx="4" ${SK}`) + R(104, 198, 192, 12, '#9fd3e6') +
        [140, 200, 260].map(x => `<line x1="${x - 34}" y1="194" x2="${x + 6}" y2="186" stroke="#c9a46a" stroke-width="3"/><rect x="${x + 4}" y="180" width="14" height="12" fill="#d8b77e" ${SK}/>`).join('') +
        R(286, 168, 36, 8, '#7fa65a', SK) + floor(254, '#e0d9c8')
    }),
    shrine_hall: () => ({
      bg: R(0, 0, W, H, '#e2efe4') + tree(20, 160, 1.2, '#6a9a66') + tree(384, 160, 1.2, '#6a9a66') +
        R(50, 100, 300, 150, '#c79b6c', SK) + [60, 140, 252, 330].map(x => R(x, 100, 10, 150, '#8e5b3a')).join('') +
        `<path d="M14,84 Q200,40 386,84 L362,104 L38,104Z" fill="#5b4636" ${SK}/>` +
        `<circle cx="200" cy="112" r="12" fill="#e7b93f" ${SK}/>` +
        `<line x1="200" y1="122" x2="200" y2="214" stroke="#d6442f" stroke-width="9"/><line x1="200" y1="122" x2="200" y2="214" stroke="#fff" stroke-width="9" stroke-dasharray="6 6"/>` +
        R(124, 214, 152, 40, '#7a4a2a', SK) + [140, 160, 180, 200, 220, 240, 260].map(x => `<line x1="${x}" y1="216" x2="${x}" y2="228" stroke="#4d2c16" stroke-width="3"/>`).join('') +
        T(200, 246, '奉納', 12, '#f3e2c3', 'text-anchor="middle"') + floor(254, '#e0d9c8')
    }),
    home_store: () => ({
      bg: R(0, 0, W, H, '#f2e6d8') + R(26, 60, 200, 32, '#2e7d6b', 'rx="4"') + T(126, 82, 'GROCERY', 17, '#fff', 'text-anchor="middle" letter-spacing="2"') +
        R(20, 104, 360, 90, '#e4d6c4', 'rx="4"') + [114, 152].map(y => shelfItems(30, y, 16, 14, 26, 21.5)).join('') +
        `<path d="M300,60 l10,-14 l10,14 l-4,0 l0,10 l-12,0 l0,-10z" fill="#d6442f"/>`,
      fg: counter('#8fa0ad', '#6f808d') + R(170, 200, 34, 30, '#2b2f36', 'rx="4"') + R(176, 206, 22, 8, '#8fe3b0'),
      behindDy: -34
    }),
    home_street: () => ({
      bg: R(0, 0, W, H, '#d7e9f6') + cloud(300, 60) + R(0, 70, 190, 180, '#b5654a', SK) +
        Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${86 + i * 18}" x2="190" y2="${86 + i * 18}" stroke="#9c513a"/>`).join('') +
        [20, 80, 140].map(x => R(x, 100, 34, 46, '#f3e9d2', SK)).join('') +
        tree(250, 196, 1, '#d8783a') + R(306, 194, 46, 58, '#3d7a4a', `rx="6" ${SK}`) + R(306, 188, 46, 10, '#2c5a37', 'rx="3"') +
        T(329, 230, 'TRASH', 11, '#fff', 'text-anchor="middle"') + floor(252, '#d4d2cc')
    }),
    home_room: () => ({
      bg: R(0, 0, W, H, '#e7ecf3') + R(40, 70, 110, 90, '#cfe6f5', 'stroke="#fff" stroke-width="6"') +
        R(244, 66, 120, 82, '#fff', SK) + `<path d="M262,138 L304,90 L346,138Z" fill="#6f8fc4"/><path d="M291,105 L304,90 L317,105 L310,102 L304,108 L298,102Z" fill="#fff"/><circle cx="340" cy="84" r="9" fill="#d6442f"/>` +
        R(20, 196, 220, 50, '#7c94b8', `rx="10" ${SK}`) + R(30, 176, 200, 30, '#8ea6c8', `rx="10" ${SK}`) + floor(252, '#c9a77a')
    }),
  };

  /* ---------- 小道具 ---------- */
  const star = (x, y, s = 1, c = '#ffd34d') => `<path transform="translate(${x},${y}) scale(${s})" d="M0,-9 Q1,-1 9,0 Q1,1 0,9 Q-1,1 -9,0 Q-1,-1 0,-9Z" fill="${c}" stroke="#d9a400" stroke-width="1"/>`;
  const numBadge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="10" fill="#d9473a" ${SK}/>` + T(x, y + 4.5, n, 13, '#fff', 'text-anchor="middle"');
  const arrow = (x1, y1, x2, y2, c = '#d9473a') => {
    const a = Math.atan2(y2 - y1, x2 - x1), h = 7;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="3"/><path d="M${x2},${y2} L${(x2 - h * Math.cos(a - .5)).toFixed(1)},${(y2 - h * Math.sin(a - .5)).toFixed(1)} L${(x2 - h * Math.cos(a + .5)).toFixed(1)},${(y2 - h * Math.sin(a + .5)).toFixed(1)}Z" fill="${c}"/>`;
  };
  const ONI = 'M0,-20 Q5,-20 16,4 Q20,14 10,14 L-10,14 Q-20,14 -16,4 Q-5,-20 0,-20Z';

  const PROPS = {
    suitcase: { box: [40, 56], draw: () => R(-7, -32, 14, 10, 'none', SK) + R(-17, -24, 34, 46, '#c05b4d', `rx="5" ${SK}`) + `<line x1="-6" y1="-20" x2="-6" y2="18" stroke="#8f3d32" stroke-width="2"/><line x1="6" y1="-20" x2="6" y2="18" stroke="#8f3d32" stroke-width="2"/>` },
    onigiri: { box: [44, 40], draw: () => `<path d="${ONI}" fill="#fff" ${SK}/>` + R(-8, 0, 16, 14, '#25362b') },
    onigiri_wrap: {
      box: [120, 116], draw: () => `<path d="M0,-50 Q10,-50 40,18 Q48,36 30,36 L-30,36 Q-48,36 -40,18 Q-10,-50 0,-50Z" fill="#fff" stroke="${INK}" stroke-width="2.5"/>` +
        R(-22, 4, 44, 32, '#25362b') + `<path d="M0,-55 Q11,-55 44,19 Q52,40 32,40 L-32,40 Q-52,40 -44,19 Q-11,-55 0,-55Z" fill="#dff0fb" fill-opacity=".35" stroke="#7fb2d6" stroke-width="2"/>` +
        `<line x1="0" y1="-54" x2="0" y2="40" stroke="#d9473a" stroke-width="4"/>` + arrow(10, -40, 10, 14) + arrow(-30, 44, -54, 56) + arrow(30, 44, 54, 56) +
        numBadge(0, -64, '1') + numBadge(-62, 52, '2') + numBadge(62, 52, '3')
    },
    coffee: { box: [30, 40], draw: () => `<path d="M-11,-16 L11,-16 L8,16 L-8,16Z" fill="#fff" ${SK}/>` + R(-10, -4, 20, 10, '#8b5a3c') + R(-13, -22, 26, 7, '#e9e9e9', `rx="2" ${SK}`) },
    ramen: {
      box: [70, 50], draw: () => `<path d="M-32,-6 Q-30,22 0,24 Q30,22 32,-6Z" fill="#c94b3a" ${SK}/><ellipse cx="0" cy="-6" rx="32" ry="8" fill="#e9b45c" ${SK}/>` +
        `<path d="M-20,-6 q6,-4 12,0 t12,0 t12,0" fill="none" stroke="#f7e3a1" stroke-width="2.5"/><circle cx="14" cy="-8" r="6" fill="#fff" stroke="#e6a23c" stroke-width="2"/><circle cx="14" cy="-8" r="2.5" fill="#f2a93b"/>` +
        R(-24, -18, 10, 12, '#25362b') + `<line x1="-30" y1="-30" x2="10" y2="-12" stroke="#c9a46a" stroke-width="3"/>`
    },
    ticket: { box: [32, 20], draw: () => R(-14, -8, 28, 16, '#f7e9a0', SK) + `<line x1="-9" y1="-2" x2="9" y2="-2" stroke="${INK}"/><line x1="-9" y1="3" x2="4" y2="3" stroke="${INK}"/>` },
    wallet: { box: [36, 26], draw: () => R(-16, -11, 32, 22, '#7b4a2c', `rx="3" ${SK}`) + `<path d="M-16,-2 L16,-2" stroke="#5a3520" stroke-width="2"/><circle cx="10" cy="-2" r="2.5" fill="#e7b93f"/>` },
    phone: { box: [20, 34], draw: () => R(-8, -15, 16, 30, '#30343c', `rx="3" ${SK}`) + R(-6, -12, 12, 22, '#8fd0ff') },
    trashbag: { box: [34, 38], draw: () => `<path d="M-12,-8 Q-16,16 0,16 Q16,16 12,-8 Z" fill="#f4f4f4" ${SK}/><path d="M-8,-8 Q-10,-20 -2,-14 M8,-8 Q10,-20 2,-14" fill="none" ${SK}/>` },
    tray: {
      box: [76, 34], draw: () => `<ellipse cx="0" cy="6" rx="36" ry="9" fill="#2f5fae"/>` + R(-36, -4, 72, 12, '#4c7ac9', `rx="6" ${SK}`) +
        R(-26, -14, 26, 13, '#d9c9a3', `rx="2" ${SK}`) + `<circle cx="-13" cy="-8" r="3.5" fill="none" stroke="#9a8a63"/>` +
        [[8, -8], [18, -9], [26, -7]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#e9c349" ${SK}/>`).join('')
    },
    yen: { box: [40, 22], draw: () => R(-18, -9, 36, 18, '#d9c9a3', `rx="2" ${SK}`) + `<circle cx="-6" cy="0" r="5" fill="none" stroke="#9a8a63" stroke-width="1.5"/>` },
    coin: { box: [16, 16], draw: () => `<circle r="7" fill="#e9c349" ${SK}/><circle r="2" fill="#fff" ${SK}/>` },
    ladle: { box: [50, 30], draw: () => `<line x1="-26" y1="10" x2="12" y2="-6" stroke="#c9a46a" stroke-width="4"/>` + R(10, -14, 16, 14, '#d8b77e', SK) },
    clock: { box: [50, 50], draw: () => `<circle r="22" fill="#fff" stroke="${INK}" stroke-width="3"/><line x1="0" y1="0" x2="0" y2="-16" stroke="${INK}" stroke-width="3"/><line x1="0" y1="0" x2="-11" y2="6" stroke="${INK}" stroke-width="4"/><circle r="2.5" fill="#d9473a"/>` },
    trashbin: {
      box: [110, 66], draw: ctx => {
        const lab = ctx.lang === 'ja' ? ['燃える', 'ペット', '缶・びん'] : ['Burnable', 'PET', 'Cans'];
        return ['#3a7bd5', '#2f9a5a', '#e08a2c'].map((c, i) => {
          const x = -54 + i * 37;
          return R(x, -24, 34, 54, c, `rx="3" ${SK}`) + R(x - 2, -30, 38, 8, '#4a4f58', `rx="2" ${SK}`) + R(x + 9, -28, 16, 4, INK, 'rx="2"') +
            T(x + 17, 6, lab[i], ctx.lang === 'ja' ? 9 : 7.5, '#fff', 'text-anchor="middle"');
        }).join('');
      }
    },
    toiletpanel: {
      box: [84, 136], draw: (ctx, o) => {
        const en = ctx.lang !== 'ja';
        const btn = [['おしり', 'Rear', '#3a8fd6'], ['ビデ', 'Bidet', '#e86fa0'], ['乾燥', 'Dry', '#7fbf6a'], ['音', 'Sound', '#4fae9b']];
        let s = R(-40, -66, 80, 132, '#eee7da', `rx="10" ${SK}`) + R(-30, -56, 60, 30, '#f08a24', `rx="6" ${SK}`) +
          T(0, -34, '止', 19, '#fff', 'text-anchor="middle"');
        if (en) s += T(22, -38, 'STOP', 6.5, '#fff', 'text-anchor="end"');
        if (o && o.hl === 'stop') s += R(-35, -61, 70, 40, 'none', 'rx="9" stroke="#ffcc33" stroke-width="5"');
        btn.forEach(([j, e, c], i) => {
          const x = -30 + (i % 2) * 32, y = -14 + (i / 2 | 0) * 34;
          s += R(x, y, 28, 26, c, `rx="5" ${SK}`) + T(x + 14, y + (en ? 13 : 17), j, j.length > 2 ? 8 : 10, '#fff', 'text-anchor="middle"');
          if (en) s += T(x + 14, y + 22, e, 6.5, '#fff', 'text-anchor="middle"');
        });
        return s + `<circle cx="-16" cy="56" r="5" fill="#bbb" ${SK}/><circle cx="16" cy="56" r="5" fill="#bbb" ${SK}/>`;
      }
    },
    sign: {
      box: [130, 60], draw: (ctx, o) => {
        const rows = wrap(pick(o && o.text, ctx), ctx.lang === 'ja' ? 10 : 15);
        const fs = 12, w = Math.max(...rows.map(units), 3) * fs + 20, h = rows.length * fs * 1.3 + 14;
        return R(-w / 2, -h / 2, w, h, '#fffdf4', `rx="4" ${SK}`) + rows.map((r, i) => T(0, -h / 2 + 7 + fs + i * fs * 1.3, r, fs, INK, 'text-anchor="middle"')).join('');
      }
    },
  };
  function drawProp(name, x, y, s, ctx, o) {
    const p = PROPS[name];
    if (!p) { ctx.warn.push(`未登録の小道具 "${name}"`); return { svg: '', box: null }; }
    const [bw, bh] = p.box;
    return {
      svg: `<g transform="translate(${x},${y}) scale(${s})">${p.draw(ctx, o)}</g>`,
      box: { x0: x - bw * s / 2, x1: x + bw * s / 2, y0: y - bh * s / 2, y1: y + bh * s / 2 }
    };
  }

  /* ---------- 人物 ---------- */
  const POSES = ['stand', 'wave', 'point', 'handsup', 'hold', 'think', 'bow', 'pray', 'shrug', 'bath'];
  const FACES = ['normal', 'happy', 'surprised', 'shock', 'confused', 'moved', 'embarrassed', 'calm', 'sad', 'determined'];
  const OUTFITS = {
    towel: { wrap: true },
    yukata: { top: '#2f4a7a', bottom: '#2f4a7a', robe: true, obi: '#d9a441', skirt: false },
    yukata2: { top: '#b04a62', bottom: '#b04a62', robe: true, obi: '#f0d9a0', skirt: false },
  };
  function handsFor(pose, f) {
    switch (pose) {
      case 'wave': return [[-f * 27, -42], [f * 36, -120]];
      case 'point': return [[-f * 27, -42], [f * 54, -84]];
      case 'handsup': return [[-38, -124], [38, -124]];
      case 'hold': return [[-12, -58], [12, -58]];
      case 'think': return [[-f * 8, -56], [f * 9, -92]];
      case 'bow': return [[-6, -46], [6, -46]];
      case 'pray': return [[-3, -92], [3, -92]];
      case 'shrug': return [[-44, -72], [44, -72]];
      default: return [[-27, -42], [27, -42]];
    }
  }
  function arm(hx, hy, col, sk) {
    const sx = hx < 0 ? -19 : 19, sy = -76, side = Math.sign(sx);
    const ex = (sx + hx) / 2 + side * 6, ey = (sy + hy) / 2 + 4;
    const d = `M${sx},${sy} Q${ex},${ey} ${hx},${hy}`;
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="12.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="8.5" stroke-linecap="round"/>` +
      `<circle cx="${hx}" cy="${hy}" r="5.8" fill="${sk}" stroke="${INK}" stroke-width="1.8"/>`;
  }
  function faceSvg(e, f, fem) {
    const o = f * 3, Lx = -12 + o, Rx = 12 + o, ey = -110, mx = o, my = -93;
    const st = `stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"`;
    const dot = x => `<ellipse cx="${x}" cy="${ey}" rx="3.4" ry="4.8" fill="${INK}"/><circle cx="${x + 1.2}" cy="${ey - 1.8}" r="1.3" fill="#fff"/>`;
    const lash = () => fem ? `<path d="M${Lx - 4},${ey - 3} l-4,-3 M${Rx + 4},${ey - 3} l4,-3" ${st} stroke-width="1.8"/>` : '';
    const blush = (op = .55) => `<ellipse cx="${-21 + o}" cy="-98" rx="6" ry="3.2" fill="#f49a9a" opacity="${op}"/><ellipse cx="${21 + o}" cy="-98" rx="6" ry="3.2" fill="#f49a9a" opacity="${op}"/>`;
    const brow = k => {
      const y = ey - 14, lift = k === 'up' ? -4 : 0;
      const tilt = k === 'sad' ? 3 : k === 'angry' ? -3 : 0;
      return `<path d="M${Lx - 6},${y + lift + tilt} L${Lx + 5},${y + lift - tilt}" ${st} stroke-width="2"/><path d="M${Rx - 5},${y + lift - tilt} L${Rx + 6},${y + lift + tilt}" ${st} stroke-width="2"/>`;
    };
    const smile = `<path d="M${mx - 5},${my} Q${mx},${my + 4} ${mx + 5},${my}" ${st}/>`;
    const open = `<path d="M${mx - 8},${my - 2} Q${mx},${my + 10} ${mx + 8},${my - 2}Z" fill="#c4505c" stroke="${INK}" stroke-width="2"/>`;
    const wavy = `<path d="M${mx - 6},${my} q3,-3 6,0 t6,0" ${st}/>`;
    const roundEye = (x, r, p) => `<circle cx="${x}" cy="${ey}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${ey}" r="${p}" fill="${INK}"/>`;
    switch (e) {
      case 'happy': return [Lx, Rx].map(x => `<path d="M${x - 5},${ey + 1} Q${x},${ey - 6} ${x + 5},${ey + 1}" ${st}/>`).join('') + brow('up') + open + blush();
      case 'surprised': return roundEye(Lx, 5.5, 2.4) + roundEye(Rx, 5.5, 2.4) + brow('up') + `<ellipse cx="${mx}" cy="${my + 1}" rx="4" ry="5" fill="#9b3a44" stroke="${INK}" stroke-width="1.8"/>`;
      case 'shock': return roundEye(Lx, 6.5, 1.4) + roundEye(Rx, 6.5, 1.4) + brow('up') + `<ellipse cx="${mx}" cy="${my + 2}" rx="6" ry="8" fill="#9b3a44" stroke="${INK}" stroke-width="2"/>` +
        [-14, -4, 6].map(x => `<line x1="${x + o}" y1="-142" x2="${x + o}" y2="-126" stroke="#5b7fd0" stroke-width="2"/>`).join('');
      case 'confused': return dot(Lx) + `<path d="M${Rx - 5},${ey} L${Rx + 5},${ey}" ${st}/>` + `<path d="M${Lx - 6},${ey - 17} L${Lx + 5},${ey - 15}" ${st} stroke-width="2"/><path d="M${Rx - 5},${ey - 13} L${Rx + 6},${ey - 12}" ${st} stroke-width="2"/>` + wavy;
      case 'moved': return [Lx, Rx].map(x => `<ellipse cx="${x}" cy="${ey}" rx="4.6" ry="6.2" fill="${INK}"/><circle cx="${x + 1.5}" cy="${ey - 2.5}" r="1.9" fill="#fff"/><circle cx="${x - 1.5}" cy="${ey + 2.5}" r="1" fill="#fff"/>`).join('') +
        lash() + brow('sad') + smile + blush() + `<path d="M${Lx - 3},${ey + 7} q-2,6 0,9 q2,-3 0,-9Z" fill="#9fd3f5" stroke="#5aa8d6" stroke-width="1"/>`;
      case 'embarrassed': return dot(Lx) + dot(Rx) + brow('sad') + wavy + blush(.85) + [-24, -20, -16, 16, 20, 24].map(x => `<line x1="${x + o}" y1="-101" x2="${x + o - 2}" y2="-95" stroke="#e06a6a" stroke-width="1.5"/>`).join('');
      case 'calm': return [Lx, Rx].map(x => `<path d="M${x - 5},${ey - 1} Q${x},${ey + 4} ${x + 5},${ey - 1}" ${st}/>`).join('') + brow('flat') + smile + blush(.7);
      case 'sad': return dot(Lx) + dot(Rx) + brow('sad') + `<path d="M${mx - 5},${my + 2} Q${mx},${my - 3} ${mx + 5},${my + 2}" ${st}/>`;
      case 'determined': return dot(Lx) + dot(Rx) + brow('angry') + `<path d="M${mx - 5},${my} L${mx + 5},${my}" ${st}/>`;
      default: return dot(Lx) + dot(Rx) + lash() + brow('flat') + smile;
    }
  }
  function hairBack(style, c) {
    if (style === 'long') return `<path d="M-38,-118 C-48,-80 -44,-56 -30,-52 L30,-52 C44,-56 48,-80 38,-118Z" fill="${c}" ${SK}/>`;
    if (style === 'bob') return `<path d="M-39,-116 C-44,-90 -42,-84 -34,-84 L34,-84 C42,-84 44,-90 39,-116Z" fill="${c}" ${SK}/>`;
    if (style === 'bun') return `<circle cx="0" cy="-150" r="12" fill="${c}" ${SK}/>`;
    return '';
  }
  function hairFront(style, c) {
    switch (style) {
      case 'long': return `<path d="M-35,-104 C-40,-154 40,-156 35,-104 C31,-122 18,-130 6,-131 C2,-122 -10,-118 -20,-121 C-28,-118 -33,-112 -35,-104Z" fill="${c}" ${SK}/>` +
        `<path d="M-35,-110 C-40,-96 -38,-84 -32,-78 L-30,-102Z M35,-110 C40,-96 38,-84 32,-78 L30,-102Z" fill="${c}" ${SK}/>`;
      case 'bob': case 'bun': return `<path d="M-37,-100 C-41,-156 41,-156 37,-100 L33,-123 L-33,-123Z" fill="${c}" ${SK}/>`;
      case 'bald': return `<ellipse cx="-32" cy="-116" rx="7" ry="12" fill="${c}" ${SK}/><ellipse cx="32" cy="-116" rx="7" ry="12" fill="${c}" ${SK}/><path d="M-10,-146 q10,-6 20,0" fill="none" stroke="${c}" stroke-width="3"/>`;
      default: return `<path d="M-36,-104 C-40,-156 38,-158 36,-104 C34,-118 28,-128 14,-131 C6,-125 -10,-125 -20,-129 C-28,-122 -34,-114 -36,-104Z" fill="${c}" ${SK}/>` +
        `<path d="M-4,-146 q8,-12 18,-4" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    }
  }
  function hatSvg(h, f) {
    if (h === 'police') return `<path d="M-35,-128 C-33,-162 33,-162 35,-128Z" fill="#26334f" ${SK}/>` + R(-35, -134, 70, 8, '#1b2236') +
      `<path d="M-37,-130 Q0,-120 37,-130 L35,-124 Q0,-114 -35,-124Z" fill="${INK}"/><circle cx="0" cy="-144" r="4.5" fill="#e7b93f" ${SK}/>`;
    if (h === 'headband') return R(-37, -138, 74, 10, '#fff', `rx="3" ${SK}`) + `<path d="M${-f * 36},-134 l${-f * 10},-8 l0,14Z" fill="#fff" ${SK}/>`;
    if (h === 'towel') return R(-18, -162, 36, 13, '#fff', `rx="3" ${SK}`) + `<line x1="-12" y1="-155" x2="12" y2="-155" stroke="#ccc"/>`;
    return '';
  }
  const MARK_STROKE = 'stroke="#fff" stroke-width="5" paint-order="stroke" text-anchor="middle"';
  function marks(e) {
    if (e === 'confused') return T(46, -144, '?', 32, INK, MARK_STROKE);
    if (e === 'surprised') return T(46, -144, '!', 32, INK, MARK_STROKE);
    if (e === 'shock') return T(48, -144, '!!', 30, '#d9473a', MARK_STROKE);
    if (e === 'embarrassed') return `<path transform="translate(38,-130)" d="M0,-9 Q7,2 0,7 Q-7,2 0,-9Z" fill="#9fd3f5" stroke="${INK}" stroke-width="1.5"/>`;
    if (e === 'moved') return star(46, -140, 1.1) + star(-48, -126, .8);
    return '';
  }
  function itemPoint(pose, f) {
    if (pose === 'hold') return [0, -64];
    const h = handsFor(pose, f)[1];
    return pose === 'stand' ? [f * 27, -46] : h;
  }

  function person(c, ctx) {
    const base = ctx.cast[c.id];
    if (!base) { ctx.warn.push(`未登録のキャラクター "${c.id}"`); return null; }
    const L = Object.assign({}, base, OUTFITS[c.outfit] || {});
    const pose = POSES.includes(c.pose) ? c.pose : 'stand';
    const face = c.face || 'normal';
    const x = c.x != null ? c.x : (SLOTS[c.at] ?? SLOTS.C);
    const s = c.s || (c.zoom ? 1.55 : 1);
    const f = c.facing === 'left' ? -1 : c.facing === 'right' ? 1 : (x <= 200 ? 1 : -1);
    const bath = pose === 'bath';
    const ty = c.ty != null ? c.ty : FLOOR + (c.dy || 0) + (c.zoom ? 62 : 0) + (bath ? 12 : 0);
    const sk = L.skin || '#f6d6bd', hc = L.hairColor || '#2a2a2a', top = L.top || '#888', bot = L.bottom || '#555';
    let lower = '', up = '';

    if (!bath) {
      const shoe = L.robe ? '#6b4b2e' : INK;
      const legs = `<line x1="-9" y1="-30" x2="-9" y2="-6" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><line x1="9" y1="-30" x2="9" y2="-6" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
        `<line x1="-9" y1="-30" x2="-9" y2="-6" stroke="${sk}" stroke-width="5.5" stroke-linecap="round"/><line x1="9" y1="-30" x2="9" y2="-6" stroke="${sk}" stroke-width="5.5" stroke-linecap="round"/>`;
      const shoes = L.wrap ? '' : `<ellipse cx="-11" cy="-3" rx="10" ry="4.5" fill="${shoe}"/><ellipse cx="11" cy="-3" rx="10" ry="4.5" fill="${shoe}"/>`;
      if (L.wrap) lower = legs;
      else if (L.robe) lower = shoes + `<path d="M-22,-52 L-26,-6 L26,-6 L22,-52Z" fill="${top}" ${SK}/><path d="M-4,-52 L-8,-6" stroke="#ffffff88" stroke-width="2"/>`;
      else if (L.skirt) lower = legs + shoes + `<path d="M-21,-50 L-29,-22 L29,-22 L21,-50Z" fill="${bot}" ${SK}/>`;
      else lower = shoes + `<path d="M-21,-50 L-21,-5 L-3,-5 L0,-34 L3,-5 L21,-5 L21,-50Z" fill="${bot}" ${SK}/>`;
    }
    up += hairBack(L.hair, hc);
    up += R(-6, -92, 12, 12, sk, SK);
    if (bath) {
      up += `<path d="M-32,-58 Q-32,-84 -10,-86 L10,-86 Q32,-84 32,-58Z" fill="${sk}" ${SK}/>`;
    } else {
      const torso = 'M-21,-48 L-23,-70 Q-23,-84 -8,-84 L8,-84 Q23,-84 23,-70 L21,-48Z';
      if (L.wrap) up += `<path d="${torso}" fill="${sk}" ${SK}/>` + R(-24, -76, 48, 54, '#fff', `rx="7" ${SK}`) + `<line x1="-20" y1="-66" x2="20" y2="-66" stroke="#ddd" stroke-width="2"/>`;
      else {
        up += `<path d="${torso}" fill="${top}" ${SK}/>`;
        if (L.robe) up += `<path d="M-9,-84 L0,-62 L9,-84" fill="none" stroke="#fff" stroke-width="3.5"/>` + R(-23, -58, 46, 10, L.obi || '#d9a441', SK);
        if (L.tie) up += `<path d="M-8,-84 L0,-76 L8,-84Z" fill="#fff"/><path d="M0,-78 L-4,-72 L0,-54 L4,-72Z" fill="#c0392b" ${SK}/>`;
        if (L.badge) up += R(6, -76, 11, 7, '#fff', `rx="1" stroke="${INK}" stroke-width="1"`);
        if (L.collar) up += `<path d="M-9,-84 L0,-74 L9,-84" fill="none" stroke="${L.collar}" stroke-width="3"/>`;
      }
      const armCol = L.wrap ? sk : (L.sleeve || top);
      handsFor(pose, f).forEach(([hx, hy]) => { up += arm(hx, hy, armCol, sk); });
    }
    up += `<circle cx="-34" cy="-110" r="6.5" fill="${sk}" ${SK}/><circle cx="34" cy="-110" r="6.5" fill="${sk}" ${SK}/>`;
    up += `<ellipse cx="0" cy="-114" rx="35" ry="33" fill="${sk}" stroke="${INK}" stroke-width="2.2"/>`;
    up += faceSvg(face, f, !!L.female);
    up += hairFront(L.hair, hc);
    up += hatSvg(c.hat || L.hat, f);
    if (c.item) {
      const [ix, iy] = itemPoint(pose, f);
      const p = PROPS[c.item];
      if (p) up += `<g transform="translate(${ix},${iy}) scale(${c.itemScale || .72})">${p.draw(ctx, c)}</g>`;
      else ctx.warn.push(`未登録の小道具 "${c.item}"`);
    }
    up += marks(face);

    const bow = pose === 'bow';
    const body = bow ? `<g transform="rotate(${f * 30} 0 -46)">${up}</g>` : up;
    const hx = x + (bow ? f * 34 * s : 0);
    const headTop = ty + (bow ? -143 : -152) * s;
    return { id: c.id, x, hx, s, headTop, svg: `<g transform="translate(${x},${ty}) scale(${s})">${lower}${body}</g>` };
  }

  /* ---------- 効果（キラキラ・湯気など） ---------- */
  const FX = ['sparkle', 'hearts', 'notes', 'steam', 'gloom', 'sweat'];
  function fxSvg(item, ctx, people) {
    const o = typeof item === 'string' ? { type: item } : item;
    let x = o.x, y = o.y;
    if (x == null) {
      const t = people.find(p => p.id === o.who) || people.find(p => Math.abs(p.x - (SLOTS[o.at] ?? -999)) < 1) || people[0];
      x = t ? t.hx : 200;
      if (y == null) y = t ? t.headTop + 40 * t.s : 170;
    }
    if (y == null) y = 170;
    switch (o.type) {
      case 'sparkle': return [[-58, 8, 1.2], [56, -10, 1.5], [48, 44, .9], [-46, -32, 1], [0, -62, .8]].map(([dx, dy, s]) => star(x + dx, y + dy, s)).join('');
      case 'hearts': return [[-52, -10, 1], [50, -24, 1.3], [44, 30, .8]].map(([dx, dy, s]) => `<path transform="translate(${x + dx},${y + dy}) scale(${s})" d="M0,6 C-12,-4 -6,-12 0,-6 C6,-12 12,-4 0,6Z" fill="#f2738c" stroke="${INK}" stroke-width="1.2"/>`).join('');
      case 'notes': return [[-56, -10, '♪'], [52, -26, '♫'], [58, 20, '♪']].map(([dx, dy, t]) => T(x + dx, y + dy, t, 22, '#3a8fd6', MARK_STROKE)).join('');
      case 'steam': return [-40, -10, 22, 46].map((dx, i) => `<path d="M${x + dx},${y + 30 - i * 4} q-8,-12 0,-24 t0,-24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/><path d="M${x + dx},${y + 30 - i * 4} q-8,-12 0,-24 t0,-24" fill="none" stroke="#b9c7cf" stroke-width="1.2" opacity=".8"/>`).join('');
      case 'gloom': return `<g opacity=".55">${Array.from({ length: 11 }, (_, i) => `<line x1="${x - 50 + i * 10}" y1="${y - 70}" x2="${x - 50 + i * 10}" y2="${y - 20 + (i % 3) * 6}" stroke="#4b5d8a" stroke-width="2"/>`).join('')}</g>`;
      case 'sweat': return [[-44, -36], [44, -28]].map(([dx, dy]) => `<path transform="translate(${x + dx},${y + dy})" d="M0,-9 Q7,2 0,7 Q-7,2 0,-9Z" fill="#9fd3f5" stroke="${INK}" stroke-width="1.5"/>`).join('');
      default: ctx.warn.push(`未登録の効果 "${o.type}"`); return '';
    }
  }
  function sfxSvg(o, ctx, top) {
    const t = pick(o, ctx);
    const size = o.size || (CJK(ctx.lang) ? 30 : 24);
    const x = o.x ?? 300, y = o.y ?? top + 70, rot = o.rot ?? -8;
    return `<g transform="translate(${x},${y}) rotate(${rot})">${T(0, 0, t, size, o.color || INK, `font-weight="900" stroke="#fff" stroke-width="6" paint-order="stroke" stroke-linejoin="round" text-anchor="middle" font-style="italic"`)}</g>`;
  }

  /* ---------- 字幕と吹き出し ---------- */
  function captionSvg(cap, ctx) {
    const t = pick(cap, ctx);
    if (!t) return { svg: '', h: 0 };
    const fs = CJK(ctx.lang) ? 14.5 : 13, lh = fs * 1.34;
    const rows = wrap(t, (W - 30) / fs);
    const h = Math.round(rows.length * lh + 14);
    return {
      h,
      svg: R(0, 0, W, h, INK) + R(0, 0, 6, h, ctx.accent || '#e2607a') +
        rows.map((r, i) => T(16, 7 + fs * 0.98 + i * lh, r, fs, '#fff')).join('')
    };
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  function bubbleShape(b, type) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (type === 'shout') {
      const n = 24, pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, r = i % 2 ? 0.84 : 1.0;
        pts.push(`${(cx + Math.cos(a) * (w / 2) * r).toFixed(1)},${(cy + Math.sin(a) * (h / 2) * r).toFixed(1)}`);
      }
      return { el: 'polygon', attrs: `points="${pts.join(' ')}"` };
    }
    const rx = type === 'off' ? 4 : type === 'think' ? h / 2 : Math.min(h / 2, 18);
    return { el: 'rect', attrs: `x="${b.x0}" y="${b.y0}" width="${w}" height="${h}" rx="${rx}"` };
  }
  function drawBubble(b, rows, fs, lh, type, tip) {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const dash = type === 'whisper' ? 'stroke-dasharray="5 4"' : '';
    const stroke = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" ${dash}`;
    let tail = '', tailCover = '';
    const inside = tip.x > b.x0 && tip.x < b.x1 && tip.y > b.y0 && tip.y < b.y1;
    if (!inside) {
      let bx, by;
      const insetY = type === 'shout' ? (b.y1 - b.y0) * 0.12 : 2;
      if (tip.y > b.y1) { bx = clamp(tip.x, b.x0 + 20, b.x1 - 20); by = b.y1 - insetY; }
      else if (tip.y < b.y0) { bx = clamp(tip.x, b.x0 + 20, b.x1 - 20); by = b.y0 + insetY; }
      else if (tip.x < b.x0) { bx = b.x0 + 4; by = clamp(tip.y, b.y0 + 12, b.y1 - 12); }
      else { bx = b.x1 - 4; by = clamp(tip.y, b.y0 + 12, b.y1 - 12); }
      const dx = tip.x - bx, dy = tip.y - by, d = Math.hypot(dx, dy) || 1;
      const len = clamp(d - 6, 10, 30);
      const tx = bx + dx / d * len, tY = by + dy / d * len, px = -dy / d * 7, py = dx / d * 7;
      if (type === 'think') {
        tail = `<circle cx="${(bx + dx / d * len * .55).toFixed(1)}" cy="${(by + dy / d * len * .55).toFixed(1)}" r="4.5" fill="#fff" ${stroke}/><circle cx="${tx.toFixed(1)}" cy="${tY.toFixed(1)}" r="2.8" fill="#fff" ${stroke}/>`;
      } else {
        const poly = `${(bx + px).toFixed(1)},${(by + py).toFixed(1)} ${tx.toFixed(1)},${tY.toFixed(1)} ${(bx - px).toFixed(1)},${(by - py).toFixed(1)}`;
        tail = `<polygon points="${poly}" fill="#fff" ${stroke}/>`;
        tailCover = `<polygon points="${poly}" fill="#fff"/>`;
      }
    }
    const shp = bubbleShape(b, type);
    const y0 = cy - ((rows.length - 1) * lh) / 2 + fs * 0.36;
    const text = rows.map((r, i) => T(cx, (y0 + i * lh).toFixed(1), r, fs, INK, 'text-anchor="middle"')).join('');
    return (type === 'think' ? '' : tail) + `<${shp.el} ${shp.attrs} fill="#fff" ${stroke}/>` + tailCover + (type === 'think' ? tail : '') + text;
  }

  function layoutBubbles(lines, people, propBoxes, top, ctx) {
    const placed = [];
    let out = '';
    const fs = ctx.bubbleFs ? ctx.bubbleFs[CJK(ctx.lang) ? 0 : 1] : (CJK(ctx.lang) ? 15 : 13.5), lh = fs * 1.3;
    const maxEn = ctx.bubbleFs ? 11.5 : 13.5;
    const heads = people.map(p => ({ x0: p.hx - 40 * p.s, x1: p.hx + 40 * p.s, y0: p.headTop, y1: p.headTop + 100 * p.s }));
    const PH = ctx.h || H;
    const bodies = people.map(p => ({ x0: p.x - 30 * p.s, x1: p.x + 30 * p.s, y0: p.headTop + 100 * p.s, y1: PH }));
    lines.forEach(ln => {
      const type = ln.type || 'say';
      const rows = wrap(pick(ln, ctx), CJK(ctx.lang) ? 9 : maxEn);
      if (!rows.length) return;
      const tw = Math.max(...rows.map(units)) * fs;
      const padX = type === 'shout' ? 26 : 15, padY = type === 'shout' ? 34 : 18;
      const w = Math.max(tw + padX * 2, 56), h = rows.length * lh + padY;
      const sp = people.find(p => p.id === ln.who);
      const ax = sp ? sp.hx : (ln.from === 'left' ? 0 : W);
      const ay = sp ? sp.headTop : top + 30;
      const prev = placed[placed.length - 1];
      let best = null;
      if (ln.pos) {  // 手動で位置を固定（pos.x = 吹き出しの中心, pos.y = 上端）
        const cx = clamp(ln.pos.x, 6 + w / 2, W - 6 - w / 2), y = clamp(ln.pos.y, top + 4, PH - 8 - h);
        best = { sc: 0, b: { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h } };
      }
      if (!best) for (let y = top + 6; y <= PH - 8 - h; y += 5) {
        for (let cx = 6 + w / 2; cx <= W - 6 - w / 2; cx += 6) {
          const b = { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h };
          const idealTop = sp ? ay - 16 - h : top + 6;
          let sc = Math.abs(cx - ax) * (sp ? 1 : 0.6) + Math.abs(y - idealTop) * 1.3;
          heads.forEach(hb => { sc += overlap(b, hb) * 3; });
          bodies.forEach(bb => { sc += overlap(b, bb) * 1.2; });
          propBoxes.forEach(pb => { sc += overlap(b, pb) * (pb.hard ? 6 : 1); });
          placed.forEach(pb => { const o = overlap({ x0: b.x0 - 6, x1: b.x1 + 6, y0: b.y0 - 6, y1: b.y1 + 6 }, pb); sc += o ? 2000 + o * 60 : 0; });
          if (prev && cx < (prev.x0 + prev.x1) / 2 - 10 && y < prev.y1 - 10) sc += 400;
          if (prev && y < prev.y0 - 8 && b.x0 < prev.x1 - 10) sc += 400;
          if (!best || sc < best.sc) best = { sc, b };
        }
      }
      if (!best) { ctx.warn.push(`吹き出しが入りません: "${pick(ln, ctx)}"`); return; }
      placed.push(best.b);
      out += drawBubble(best.b, rows, fs, lh, type, sp ? { x: ax, y: ay - 2 } : { x: ax, y: ay });
    });
    return out;
  }

  /* ---------- 組み立て ---------- */
  function renderPanel(p, opts) {
    // opts.caption=false: 字幕をSVGに入れない（HTML側で大きく表示する場合）。opts.bubbleFs=[日本語px, 英語px]: 吹き出し文字サイズ
    const ctx = { lang: opts.lang || 'ja', cast: opts.cast || {}, accent: opts.accent, warn: opts.warn || [], bubbleFs: opts.bubbleFs };
    const cap = opts.caption === false ? { svg: '', h: 0 } : captionSvg(p.cap, ctx);
    if (p.image) return renderImagePanel(p, ctx, cap, opts);
    const sceneFn = SCENES[p.scene];
    if (!sceneFn) ctx.warn.push(`未登録の背景 "${p.scene}"`);
    const sc = (sceneFn || SCENES.plain)(ctx);
    const behindC = c => c.behind || c.pose === 'bath' || (sc.behindAll && c.behind !== false);
    const people = (p.chars || []).map(c => {
      const cc = (sc.behindDy && behindC(c) && c.dy == null) ? Object.assign({}, c, { dy: sc.behindDy }) : c;
      return { c, r: person(cc, ctx) };
    }).filter(o => o.r);
    const isBehind = o => behindC(o.c);
    const props = (p.props || []).map(pr => drawProp(pr.item, pr.x ?? 200, pr.y ?? 220, pr.s ?? 1, ctx, pr));
    const rs = people.map(o => o.r);
    const fx = (p.fx || []).map(f => fxSvg(f, ctx, rs)).join('');
    const sfx = (p.sfx || []).map(o => sfxSvg(o, ctx, cap.h)).join('');
    const sfxBoxes = (p.sfx || []).map(o => {
      const size = o.size || (CJK(ctx.lang) ? 30 : 24), w = units(pick(o, ctx)) * size, x = o.x ?? 300, y = o.y ?? cap.h + 70;
      return { x0: x - w / 2, x1: x + w / 2, y0: y - size, y1: y + 6 };
    });
    const bubbles = layoutBubbles(p.lines || [], rs, props.map(x => x.box).filter(Boolean).concat(sfxBoxes.map(b => Object.assign(b, { hard: true }))), cap.h, ctx);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" font-family="${FONT}">` +
      sc.bg + people.filter(isBehind).map(o => o.r.svg).join('') + (sc.fg || '') +
      props.map(x => x.svg).join('') + people.filter(o => !isBehind(o)).map(o => o.r.svg).join('') +
      fx + sfx + bubbles + cap.svg + `</svg>`;
  }

  /* 絵を画像（AI生成イラストなど）に差し替えたコマ。
   * p.image: 画像ファイルのパス / p.imageSize: [幅, 高さ]（縦横比に使う）
   * p.anchors: { 話し手id: { x, y, s } }  … 画像を幅400に縮めたときの「頭のてっぺん」の位置と、頭の大きさの目安(s) */
  /* opts.fill = [9, 16] のように縦横比を渡すと「全画面モード」：
   *   画像をその比率の枠いっぱいに拡大して切り抜く（CSSの object-fit: cover と同じ）。
   *   切り抜く中心は p.focus（画像の横幅に対する 0〜1。省略時 0.5）。
   *   頭の位置・固定した吹き出し位置・効果音は、切り抜き後の座標へ自動で変換する。
   *   opts.reserveBottom: 下に重ねる字幕のぶん、吹き出しを置かない高さ（SVG単位） */
  function renderImagePanel(p, ctx, cap, opts) {
    const [iw, ih] = p.imageSize || [4, 3];
    const baseH = W * ih / iw;                 // 元の座標系（幅400）での高さ
    let PH, scale, offX = 0, offY = 0;
    if (opts.fill) {
      PH = Math.round(W * opts.fill[1] / opts.fill[0]);
      scale = Math.max(PH / ih, W / iw);       // 画像1pxあたりの表示サイズ（枠を必ず埋める）
      const dw = iw * scale, dh = ih * scale;
      offX = clamp(W / 2 - (p.focus ?? 0.5) * dw, W - dw, 0);
      offY = clamp(PH / 2 - (p.focusY ?? 0.5) * dh, PH - dh, 0);
    } else {
      PH = Math.round(baseH);
      scale = W / iw;
    }
    const k = scale * iw / W;                  // 元の座標 → 表示座標の倍率
    const mx = x => x * k + offX, my = y => y * k + offY;
    ctx.h = PH;
    const src = (opts.imageBase || '') + p.image;
    const rs = Object.entries(p.anchors || {}).map(([id, a]) => ({ id, x: mx(a.x), hx: mx(a.x), s: (a.s || 0.8) * k, headTop: my(a.y) }));
    const lines = (p.lines || []).map(ln => ln.pos ? Object.assign({}, ln, { pos: { x: mx(ln.pos.x), y: my(ln.pos.y) } }) : ln);
    const sfxList = (p.sfx || []).map(o => Object.assign({}, o, { x: clamp(mx(o.x ?? 300), 60, W - 60), y: clamp(my(o.y ?? 70), 40, PH - 40) }));
    const sfx = sfxList.map(o => sfxSvg(o, ctx, cap.h)).join('');
    const boxes = sfxList.map(o => {
      const size = o.size || (CJK(ctx.lang) ? 30 : 24), w = units(pick(o, ctx)) * size;
      return { x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - size, y1: o.y + 6, hard: true };
    });
    if (opts.reserveBottom) boxes.push({ x0: 0, x1: W, y0: PH - opts.reserveBottom, y1: PH, hard: true });
    const fx = (p.fx || []).map(f => fxSvg(f, ctx, rs)).join('');
    const bubbles = layoutBubbles(lines, rs, boxes, cap.h, ctx);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${PH}" preserveAspectRatio="xMidYMid slice" role="img" font-family="${FONT}">` +
      `<image href="${esc(src)}" x="${offX.toFixed(1)}" y="${offY.toFixed(1)}" width="${(iw * scale).toFixed(1)}" height="${(ih * scale).toFixed(1)}"/>` +
      fx + sfx + bubbles + cap.svg + `</svg>`;
  }

  function portrait(id, cast, face = 'happy') {
    const ctx = { lang: 'ja', cast, warn: [] };
    const r = person({ id, face, x: 0, ty: 0, pose: 'wave', facing: 'right' }, ctx);
    return r ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-62 -176 124 124" role="img">${r.svg}</svg>` : '';
  }

  /* ---------- 脚本チェック ---------- */
  const LIMITS = { panels: 6, capRows: 2, lineRows: 3, linesPerPanel: 2 };
  function validate(manga) {
    const w = [];
    const cast = manga.cast || {};
    (manga.episodes || []).forEach((ep, ei) => {
      const tag = `第${ep.no || ei + 1}話`;
      const panels = ep.panels || [];
      if (panels.length !== LIMITS.panels) w.push(`${tag}: コマ数が${panels.length}です（6コマにしてください）`);
      // 必須は日本語と英語。ほかの言語はタイトルに訳がある話だけ、全文がそろっているかを確認
      const langs = ['ja', 'en'].concat(Object.keys(ep.title || {}).filter(l => l !== 'ja' && l !== 'en'));
      ['ja', 'en'].forEach(l => { if (!ep.title || !ep.title[l]) w.push(`${tag}: タイトル(${l})がありません`); });
      langs.forEach(l => { if (ep.tip && !(ep.tip[l] || []).length) w.push(`${tag}: ミニ知識(${l})がありません`); });
      if (ep.pov && !cast[ep.pov] && ep.pov !== 'both') w.push(`${tag}: 語り手 "${ep.pov}" が登場人物にいません`);
      panels.forEach((p, pi) => {
        const pt = `${tag} ${pi + 1}コマ目`;
        if (p.image) {
          if (!p.imageSize) w.push(`${pt}: 画像の大きさ imageSize [幅, 高さ] がありません`);
        } else if (!SCENES[p.scene]) w.push(`${pt}: 未登録の背景 "${p.scene}"`);
        (p.chars || []).forEach(c => {
          if (!cast[c.id]) w.push(`${pt}: 未登録のキャラクター "${c.id}"`);
          if (c.pose && !POSES.includes(c.pose)) w.push(`${pt}: 未登録のポーズ "${c.pose}"`);
          if (c.face && !FACES.includes(c.face)) w.push(`${pt}: 未登録の表情 "${c.face}"`);
          if (c.at && !(c.at in SLOTS)) w.push(`${pt}: 立ち位置 "${c.at}" は L/LC/C/RC/R のどれかにしてください`);
          if (c.item && !PROPS[c.item]) w.push(`${pt}: 未登録の小道具 "${c.item}"`);
          if (c.outfit && !OUTFITS[c.outfit]) w.push(`${pt}: 未登録の衣装 "${c.outfit}"`);
        });
        (p.props || []).forEach(pr => { if (!PROPS[pr.item]) w.push(`${pt}: 未登録の小道具 "${pr.item}"`); });
        (p.fx || []).forEach(f => { const t = typeof f === 'string' ? f : f.type; if (!FX.includes(t)) w.push(`${pt}: 未登録の効果 "${t}"`); });
        const lines = p.lines || [];
        if (lines.length > LIMITS.linesPerPanel) w.push(`${pt}: 台詞が${lines.length}個あります（2個まで）`);
        langs.forEach(l => {
          const fs = CJK(l) ? 14.5 : 13;
          if (p.cap) {
            if (!p.cap[l]) w.push(`${pt}: 字幕(${l})がありません`);
            else { const n = wrap(p.cap[l], (W - 30) / fs).length; if (n > LIMITS.capRows) w.push(`${pt}: 字幕(${l})が${n}行です（2行まで）`); }
          }
          lines.forEach(ln => {
            if (!ln[l]) { w.push(`${pt}: 台詞(${l})がありません`); return; }
            const n = wrap(ln[l], CJK(l) ? 9 : 13.5).length;
            if (n > LIMITS.lineRows) w.push(`${pt}: 台詞(${l})「${ln[l]}」が${n}行です（3行まで）`);
          });
        });
        lines.forEach(ln => {
          if (p.image) { if (ln.who && !(p.anchors || {})[ln.who]) w.push(`${pt}: 話し手 "${ln.who}" の頭の位置 (anchors) がありません`); }
          else if (ln.who && !(p.chars || []).some(c => c.id === ln.who) && !ln.from) w.push(`${pt}: 話し手 "${ln.who}" がコマにいません（画面外なら from を指定）`);
        });
        const xs = lines.map(ln => {
          if (ln.pos) return null;
          if (p.image) { const a = (p.anchors || {})[ln.who]; return a ? a.x : null; }
          const c = (p.chars || []).find(c => c.id === ln.who); return c ? (c.x ?? SLOTS[c.at] ?? SLOTS.C) : null;
        });
        for (let i = 1; i < xs.length; i++) if (xs[i] != null && xs[i - 1] != null && xs[i] < xs[i - 1]) w.push(`${pt}: 先に話す人を左に置いてください（吹き出しは左→右に読まれます）。難しいときは台詞に pos で位置を指定`);
      });
      if (!ep.tip || !(ep.tip.ja || []).length) w.push(`${tag}: ミニ知識がありません`);
    });
    return w;
  }

  function catalog() {
    return {
      scenes: Object.keys(SCENES), poses: POSES, faces: FACES, props: Object.keys(PROPS), fx: FX,
      outfits: Object.keys(OUTFITS), slots: Object.keys(SLOTS), bubbles: ['say', 'think', 'shout', 'whisper', 'off'], limits: LIMITS
    };
  }

  root.MangaEngine = { renderPanel, portrait, validate, catalog, wrap, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
