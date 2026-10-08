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

const BOTTOM_L = ['layer', 'dismiss', 'tab', 'space'];
const BOTTOM_R = ['left', 'up', 'down', 'right', 'newline'];

let kb, host, resizeT, repeat = null;
let layer = 'alpha', shift = false;

const extKb     = () => localStorage.getItem('ext-kb') === '1';
const previewing = () => document.body.classList.contains('kb-preview');

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
    if (previewing()) return;
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

    /* ----- Пробел-трекпад: свайп двигает курсор, тап вставляет пробел ----- */
    if (key === 'space') {
        let id = null;
        let x0 = 0, y0 = 0, ax = 0, ay = 0, moved = false;

        b.addEventListener('pointerdown', e => {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch {}
            id = e.pointerId;
            x0 = ax = e.clientX;
            y0 = ay = e.clientY;
            moved = false;
        });
        b.addEventListener('pointermove', e => {
            if (e.pointerId !== id || previewing()) return;
            if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 8) return;
            moved = true;
            const dx = Math.trunc((e.clientX - ax) / 12);   /* 12px ≈ 1 символ */
            const dy = Math.trunc((e.clientY - ay) / 24);   /* 24px ≈ 1 строка */
            if (dx) { ed.moveCursor(dx); ax += dx * 12; }
            if (dy) {
                for (let i = 0; i < Math.abs(dy); i++) ed.moveLine(dy > 0 ? 1 : -1);
                ay += dy * 24;
            }
        });
        const end = e => {
            if (e.pointerId !== id) return;
            id = null;
            if (!moved && e.type === 'pointerup' && !previewing()) press('space');
        };
        b.addEventListener('pointerup', end);
        b.addEventListener('pointercancel', end);
        return b;
    }

    /* ----- Обычные клавиши ----- */
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
    requestAnimationFrame(() => requestAnimationFrame(() => ed.revealCursor()));
};

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
        let sx = 0, sy = 0, st = 0;
        h.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); }, true);
        h.addEventListener('pointerup', e => {
            const tap = Math.hypot(e.clientX - sx, e.clientY - sy) < 10 && Date.now() - st < 400;
            if (tap) show();
        }, true);
        h.addEventListener('focusout', hide);
    });

    /* Терминал использует нативную клавиатуру: inputmode="none" ломает фокус на iOS. */
    const cmd = $('#cmd');
    if (cmd) {
        cmd.inputMode = 'text';
        cmd.setAttribute('autocapitalize', 'off');
        cmd.setAttribute('autocorrect', 'off');
        cmd.setAttribute('autocomplete', 'off');
        cmd.setAttribute('spellcheck', 'false');
        cmd.setAttribute('enterkeyhint', 'send');
    }

    const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(render, 120); };
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);

    render();
}

export function refreshInput() {
    ed.refreshInput();
}