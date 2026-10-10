import * as ed from './editor.js';
import { isLandscape as IS_LANDSCAPE, shouldKb } from './platform.js';

const $ = s => document.querySelector(s);

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
let allHosts = [];

/* ----- Тачбар / виртуальный курсор / детектор встряхивания ----- */
let padMode = false, cursorEl = null;
let cx = 0, cy = 0;                       // позиция виртуального курсора
let lastMag = 0, spikes = [], lastToggle = 0, motionOn = false;

const SHAKE_JERK = 18;      // порог резкости (м/с² между замерами), меньше = чувствительнее
const SHAKE_COUNT = 3;      // сколько пиков подряд
const SHAKE_WINDOW = 700;   // за сколько мс
const PAD_GAIN = 1.6;       // скорость курсора

const previewing = () => document.body.classList.contains('kb-preview');

const REPEATABLE = new Set(['backspace', 'left', 'right', 'up', 'down']);
const stopRepeat = () => {
    if (!repeat) return;
    clearTimeout(repeat.t);
    clearInterval(repeat.i);
    repeat = null;
};

const rows = () => (layer === 'alpha' ? ALPHA : SYMBOLS);

/* ===================== Цель ввода (редактор / терминал) =====================
   Одна и та же клавиатура пишет в разные места: в CodeMirror или в поле
   терминала. Цель переключается по активной секции. */
const editorTarget = {
    name: 'editor',
    insert: (t, o) => ed.insert(t, o),
    backspace: () => ed.backspace(),
    newline: () => ed.newline(),
    indent: () => ed.indent(),
    moveCursor: d => ed.moveCursor(d),
    moveLine: d => ed.moveLine(d),
    dismiss: () => ed.blur(),
    focus: () => ed.focus(),
};
const targets = { editor: editorTarget };
let target = editorTarget;

export const registerTarget = (name, t) => { targets[name] = t; };
export const setTarget = name => {
    target = targets[name] || editorTarget;
    /* Если клавиатура уже открыта, сразу поправляем отступ под терминал. */
    if (document.body.classList.contains('typing')) {
        document.body.classList.toggle('kb-term', target.name === 'terminal');
    }
};

const dismiss = () => {
    document.body.classList.remove('typing', 'kb-term');
    target?.dismiss?.();
};

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
    if (key === 'dismiss') { dismiss(); return; }

    const oneShot = shift;
    switch (key) {
        case 'backspace': target.backspace(); break;
        case 'tab':       target.indent();    break;
        case 'space':     target.insert(' '); break;
        case 'newline':   target.newline();   break;
        case 'left':      target.moveCursor(-1); break;
        case 'right':     target.moveCursor(1);  break;
        case 'up':        target.moveLine(-1);   break;
        case 'down':      target.moveLine(1);    break;
        default:          target.insert(out(key));
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
            if (dx) { target.moveCursor(dx); ax += dx * 12; }
            if (dy) {
                for (let i = 0; i < Math.abs(dy); i++) target.moveLine(dy > 0 ? 1 : -1);
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

/* ===================== Виртуальный курсор и клик ===================== */

const ensureCursor = () => {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement('div');
    cursorEl.className = 'vcursor';
    cursorEl.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" ' +
        'fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.append(cursorEl);
    return cursorEl;
};

const moveVCursor = (x, y) => {
    cx = Math.max(0, Math.min(window.innerWidth - 1, x));
    cy = Math.max(0, Math.min(window.innerHeight - 1, y));
    ensureCursor().style.transform = `translate(${cx}px, ${cy}px)`;
};

const fire = (el, type, Ctor = MouseEvent, extra = {}) =>
    el.dispatchEvent(new Ctor(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: cx, clientY: cy, button: 0, ...extra
    }));

const virtualClick = (dbl = false) => {
    const el = document.elementFromPoint(cx, cy);
    if (!el) return;

    // Если в editor.js есть свой метод, используем его — это самый надёжный путь
    if (typeof ed.clickAt === 'function') { ed.clickAt(cx, cy, dbl ? 2 : 1); return; }

    const pe = { pointerType: 'mouse', isPrimary: true };
    fire(el, 'pointerdown', PointerEvent, pe);
    fire(el, 'mousedown');
    fire(el, 'pointerup', PointerEvent, pe);
    fire(el, 'mouseup');
    fire(el, 'click');
    if (dbl) fire(el, 'dblclick', MouseEvent, { detail: 2 });

    // Запасной вариант: поставить каретку в contenteditable по координатам
    if (el.isContentEditable) {
        const r = document.caretRangeFromPoint?.(cx, cy);
        if (r) {
            const s = getSelection();
            s.removeAllRanges();
            s.addRange(r);
        }
    } else if (el.focus) el.focus();
};

const setPad = on => {
    if (padMode === on) return;
    padMode = on;
    if (on) {
        const r = (host || document.body).getBoundingClientRect();
        moveVCursor(r.left + r.width / 2, r.top + r.height / 3);
        ensureCursor().style.display = 'block';
    } else if (cursorEl) cursorEl.style.display = 'none';
    navigator.vibrate?.(on ? [20, 40, 20] : 20);
    render();
};

const buildPad = () => {
    const pad = document.createElement('div');
    pad.className = 'kb-pad';

    const hint = document.createElement('div');
    hint.className = 'kb-pad-hint';
    hint.textContent = 'Тап — клик · двойной тап — двойной клик · встряхни для клавиатуры';

    const bar = document.createElement('div');
    bar.className = 'kb-pad-bar';
    const mk = (txt, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
        return b;
    };
    bar.append(mk('Клик', () => virtualClick()), mk('⌨', () => setPad(false)));

    // жесты на поверхности
    let id = null, lx = 0, ly = 0, t0 = 0, dist = 0, lastTap = 0;
    pad.addEventListener('pointerdown', e => {
        if (e.target.closest('.kb-pad-bar')) return;
        e.preventDefault();
        try { pad.setPointerCapture(e.pointerId); } catch {}
        id = e.pointerId; lx = e.clientX; ly = e.clientY; t0 = Date.now(); dist = 0;
    });
    pad.addEventListener('pointermove', e => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        dist += Math.hypot(dx, dy);
        const speed = Math.min(2.2, 1 + Math.hypot(dx, dy) / 12); // лёгкое ускорение
        moveVCursor(cx + dx * PAD_GAIN * speed, cy + dy * PAD_GAIN * speed);
    });
    const end = e => {
        if (e.pointerId !== id) return;
        id = null;
        if (e.type === 'pointerup' && dist < 6 && Date.now() - t0 < 250) {
            const now = Date.now();
            const dbl = now - lastTap < 320;
            lastTap = dbl ? 0 : now;
            virtualClick(dbl);
        }
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    pad.append(hint, bar);
    return pad;
};

/* ===================== Рендер ===================== */

const render = () => {
    if (!kb) return;
    stopRepeat();
    kb.innerHTML = '';
    kb.classList.toggle('split', IS_LANDSCAPE() && !padMode);
    kb.classList.toggle('padmode', padMode);

    if (padMode) { kb.append(buildPad()); return; }

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
    if (!shouldKb()) return;
    document.body.classList.add('typing');
    document.body.classList.toggle('kb-term', target.name === 'terminal');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (target.name === 'terminal') target.focus?.();
        else ed.revealCursor();
    }));
};

const hide = e => {
    const rt = e?.relatedTarget;
    if (!rt || !rt.matches?.('input, textarea, select')) return;
    /* Переход фокуса на наш редактор/терминал — клавиатуру оставляем. */
    if (allHosts.some(h => h && (h === rt || h.contains(rt)))) return;
    dismiss();
};

/* ===================== Детектор встряхивания ===================== */

const onMotion = e => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    const jerk = Math.abs(m - lastMag);
    lastMag = m;
    if (jerk < SHAKE_JERK) return;

    const now = Date.now();
    spikes = spikes.filter(t => now - t < SHAKE_WINDOW);
    spikes.push(now);
    if (spikes.length < SHAKE_COUNT || now - lastToggle < 1200) return;

    spikes = [];
    lastToggle = now;
    // реагируем только когда экранная клавиатура реально открыта
    if (!document.body.classList.contains('typing') && !padMode) return;
    setPad(!padMode);
};

const enableMotion = async () => {
    if (motionOn || typeof DeviceMotionEvent === 'undefined') return;
    try {
        // iOS требует разрешения, вызванного из жеста пользователя
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const r = await DeviceMotionEvent.requestPermission();
            if (r !== 'granted') return;
        }
        window.addEventListener('devicemotion', onMotion);
        motionOn = true;
    } catch {}
};

/* ===================== Публичный API ===================== */

export function init(hostDefs) {
    kb = $('#keyboard');
    const arr = (Array.isArray(hostDefs) ? hostDefs : [hostDefs])
        .filter(Boolean)
        .map(h => h.el ? h : { el: h, target: 'editor' });

    allHosts = arr.map(h => h.el).filter(Boolean);
    host = allHosts[0];

    arr.forEach(({ el, target: tname }) => {
        if (!el) return;
        let sx = 0, sy = 0, st = 0;
        el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); }, true);
        el.addEventListener('pointerup', e => {
            const tap = Math.hypot(e.clientX - sx, e.clientY - sy) < 10 && Date.now() - st < 400;
            if (tap) { if (tname) setTarget(tname); show(); }
        }, true);
        el.addEventListener('focusout', hide);
    });

    /* Ввод терминала: при экранной клавиатуре глушим нативную, при внешней — оставляем text. */
    const cmd = $('#cmd');
    if (cmd) {
        cmd.inputMode = shouldKb() ? 'none' : 'text';
        cmd.setAttribute('autocapitalize', 'off');
        cmd.setAttribute('autocorrect', 'off');
        cmd.setAttribute('autocomplete', 'off');
        cmd.setAttribute('spellcheck', 'false');
        cmd.setAttribute('enterkeyhint', 'send');
    }

    const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(render, 120); };
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('resize', onResize);

    // Android включится сразу, iOS — по первому касанию клавиатуры/редактора
    enableMotion();
    kb.addEventListener('pointerdown', enableMotion, { once: true });
    arr.forEach(({ el }) => el && el.addEventListener('pointerup', enableMotion, { once: true }));

    render();
}

export function refreshInput() {
    ed.refreshInput();
    const cmd = $('#cmd');
    if (cmd) cmd.inputMode = shouldKb() ? 'none' : 'text';
}

export const togglePad = () => setPad(!padMode);