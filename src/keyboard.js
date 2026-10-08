import * as ed from './editor.js';

const $ = s => document.querySelector(s);
const IS_MOBILE = () => window.matchMedia('(max-width: 899px), (max-height: 500px)').matches;
const IS_LANDSCAPE = () => window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;

const SHIFT_MAP = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
    '6': '^', '7': '&', '8': '*', '9': '(', '0': ')'
};

const ALPHA = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace']
];
const SYMBOLS = [
    ['{', '}', '(', ')', '[', ']', ';', ':'],
    ['"', "'", '`', '~', '=', '<', '>', '/'],
    ['!', '@', '#', '$', '%', '^', '&', '|'],
    ['?', '.', ',', '_', '\\', '+', '-', '*', 'backspace']
];
const BOTTOM = ['layer', 'dismiss', 'tab', 'space', 'left', 'up', 'down', 'right', 'newline'];

/* Для сплита — своя раскладка нижнего ряда, чтобы половинки были сбалансированы */
const BOTTOM_L = ['layer', 'dismiss', 'tab', 'space'];
const BOTTOM_R = ['left', 'up', 'down', 'right', 'newline'];

let kb, host, resizeT, repeat = null;
let layer = 'alpha', shift = false;

const extKb     = () => localStorage.getItem('ext-kb') === '1';
const previewing = () => document.body.classList.contains('kb-preview');

/* Клавиши, которые повторяются при удержании */
const REPEATABLE = new Set(['backspace', 'left', 'right', 'up', 'down']);
const stopRepeat = () => {
    if (!repeat) return;
    clearTimeout(repeat.t);
    clearInterval(repeat.i);
    repeat = null;
};

const rows = () => (layer === 'alpha' ? ALPHA : SYMBOLS);

const out = key => {
    if (shift && layer === 'alpha') {
        if (/[a-z]/.test(key)) return key.toUpperCase();
        if (SHIFT_MAP[key]) return SHIFT_MAP[key];
    }
    return key;
};

const label = key => ({
    shift: '⇧', backspace: '⌫', tab: 'Tab', space: '␣', newline: '⏎',
    left: '←', up: '↑', down: '↓', right: '→',
    layer: layer === 'alpha' ? '#+=' : 'abc', dismiss: '⌄'
}[key] ?? out(key));

const press = key => {
    if (key === 'shift')   { shift = !shift; render(); return; }
    if (key === 'layer')   { layer = layer === 'alpha' ? 'symbols' : 'alpha'; shift = false; render(); return; }
    if (previewing()) return;                 /* настройки: только смотрим */
    if (key === 'dismiss') { document.body.classList.remove('typing'); ed.blur(); return; }

    const oneShot = shift;
    switch (key) {
        case 'backspace': ed.backspace(); break;
        case 'tab':       ed.indent();    break;
        case 'space':     ed.insert(' '); break;
        case 'newline':   ed.newline();   break;
        case 'left':      ed.moveCursor(-1); break;
        case 'right':     ed.moveCursor(1);  break;
        case 'up':        ed.moveLine(-1);   break;
        case 'down':      ed.moveLine(1);    break;
        default:          ed.insert(out(key));
    }
    if (oneShot) { shift = false; render(); }
};

const FN = new Set(['shift','backspace','tab','newline','left','up','down','right','layer','dismiss']);

const mkKey = key => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label(key);
    if (FN.has(key)) b.className = 'fn';
    if (key === 'space') b.classList.add('wide');
    if (key === 'dismiss') b.classList.add('accent');
    if (key === 'shift' && shift) b.classList.add('on');
    /* preventDefault — фокус остаётся в редакторе, нативка не всплывает */
    b.addEventListener('pointerdown', e => {
        e.preventDefault();
        press(key);
        if (REPEATABLE.has(key) && !previewing()) {
            stopRepeat();
            const t = setTimeout(() => {
                const i = setInterval(() => press(key), 45);
                repeat = { i };
            }, 380);
            repeat = { t };
        }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, stopRepeat));
    return b;
};

const row = (keys, parent) => {
    const r = document.createElement('div');
    r.className = 'kb-row';
    keys.forEach(k => r.append(mkKey(k)));
    parent.append(r);
};

const render = () => {
    if (!kb) return;
    stopRepeat();
    kb.innerHTML = '';
    kb.classList.toggle('split', IS_LANDSCAPE());

    if (IS_LANDSCAPE()) {
        const wrap = document.createElement('div');
        wrap.className = 'kb-split';
        const L = document.createElement('div'); L.className = 'kb-half';
        const R = document.createElement('div'); R.className = 'kb-half';

        rows().forEach(r => {
            const mid = Math.ceil(r.length / 2);
            row(r.slice(0, mid), L);
            row(r.slice(mid), R);
        });
        row(BOTTOM_L, L);
        row(BOTTOM_R, R);

        wrap.append(L, R);
        kb.append(wrap);
    } else {
        rows().forEach(r => row(r, kb));
        row(BOTTOM, kb);
    }
};

const show = () => {
    if (extKb() || !IS_MOBILE()) return;
    if (document.body.classList.contains('typing')) return;
    document.body.classList.add('typing');
    /* редактор стал ниже — возвращаем курсор в видимую область */
    requestAnimationFrame(() => requestAnimationFrame(() => ed.revealCursor()));
};

/* Нативная клавиатура нужна только когда фокус ушёл в обычное поле (терминал, диалоги) */
const hide = e => {
    const rt = e?.relatedTarget;
    if (!rt || !rt.matches?.('input, textarea, select')) return;
    const hosts = [document.querySelector('#ed'), document.querySelector('#ed2')].filter(Boolean);
    if (hosts.some(h => h.contains(rt))) return;
    document.body.classList.remove('typing');
};

export function init(hosts) {
    kb = $('#keyboard');
    const arr = (Array.isArray(hosts) ? hosts : [hosts]).filter(Boolean);
    host = arr[0];

    arr.forEach(h => {
        /* Показываем клавиатуру только по тапу. Начало скролла (pointerdown + движение)
           не должно её открывать — иначе редактор сжимается прямо под пальцем. */
        let sx = 0, sy = 0, st = 0;
        h.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); }, true);
        h.addEventListener('pointerup', e => {
            const tap = Math.hypot(e.clientX - sx, e.clientY - sy) < 10 && Date.now() - st < 400;
            if (tap) show();
        }, true);
        h.addEventListener('focusout', hide);
    });

    const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(render, 120); };
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);

    render();
}