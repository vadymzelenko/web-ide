import * as fs from './fs.js';
import * as ed from './editor.js';
import * as pv from './preview.js';
import * as term from './terminal.js';
import * as ui from './ui.js';
import * as keyboard from './keyboard.js';
import { format } from './format.js';
import { exp as exportZip, imp as importZip } from './zip.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const langOf = p => ({ html: 'html', css: 'css', js: 'js' }[p.split('.').pop()] || 'js');

ui.theme(localStorage.getItem('theme') || 'dark');
ui.fontSize(localStorage.getItem('fs') || 14);

/* ================================================================
   Два пейна
   ================================================================ */
const P = [
    { open: [], cur: null, dirty: false, api: null },
    { open: [], cur: null, dirty: false, api: null }
];
let active = 0;

/* ---------- Statusbar ---------- */
const setSaved = ok => {
    const el = $('#st-saved');
    if (!el) return;
    el.innerHTML = ok
        ? '<svg viewBox="0 0 24 24" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg><span>готов</span>'
        : '● изменено';
    el.classList.toggle('dirty', !ok);
};
const setStatusFile = p => {
    const f = $('#st-file'); if (f) f.textContent = p ? p.split('/').pop() : '—';
    const l = $('#st-lang'); if (l) l.textContent = p ? langOf(p) : 'plain';
};

/* ---------- Tabs ---------- */
const renderTabs = i => {
    const st = P[i];
    const bar = i === 0 ? $('#tabs') : $('#tabs2');
    if (!bar) return;
    bar.innerHTML = '';
    st.open = st.open.filter(f => fs.isFile(f));
    st.open.forEach(f => {
        const b = document.createElement('button');
        b.className = f === st.cur ? 'on' : '';
        const name = document.createElement('span');
        name.textContent = f.split('/').pop();
        const x = document.createElement('span');
        x.className = 'close';
        x.textContent = '×';
        x.onclick = e => { e.stopPropagation(); closeTab(i, f); };
        b.append(name, x);
        b.onclick = () => openIn(i, f);
        bar.append(b);
    });
};

/* ---------- save ---------- */
const save = () => {
    fs.save();
    pv.run();
    P[active].dirty = false;
    setSaved(true);
};

/* ---------- open / close ---------- */
const openIn = (i, p) => {
    if (!fs.isFile(p)) return;
    const st = P[i];
    if (!st.open.includes(p)) st.open.push(p);
    st.cur = p;
    st.api?.set(fs.state.files[p] || '', langOf(p));
    renderTabs(i);
    if (i === active) {
        setStatusFile(p);
        setSaved(!st.dirty);
    }
    ui.show('editor');
    ed.setActive(st.api);
    st.api?.focus();
    pv.run();
};

const closeTab = (i, p) => {
    const st = P[i];
    const idx = st.open.indexOf(p);
    if (idx < 0) return;
    st.open.splice(idx, 1);
    if (st.cur === p) {
        st.cur = st.open[idx] || st.open[idx - 1] || null;
        if (st.cur) st.api?.set(fs.state.files[st.cur], langOf(st.cur));
        else        st.api?.set('');
        if (i === active) setStatusFile(st.cur);
    }
    renderTabs(i);
};

/* ---------- Обновление ---------- */
function refresh() {
    ui.tree($('#tree'), {
        open: p => openIn(active, p),
        change: refresh,
        current: P[active].cur
    });
    renderTabs(0);
    renderTabs(1);
    pv.schedule();
}

/* ---------- Инициализация ---------- */
await fs.load();

const makeHandlers = i => ({
    onChange: t => {
        const st = P[i];
        if (!st.cur) return;
        fs.write(st.cur, t);
        st.dirty = true;
        if (i === active) setSaved(false);
        pv.schedule();
    },
    onSave: save,
    onRun: () => { pv.run(); ui.show('preview'); },
    onCursor: ({ line, col }) => {
        if (i !== active) return;
        const el = $('#st-pos');
        if (el) el.textContent = `${line}:${col}`;
    }
});

P[0].api = ed.create($('#ed'), makeHandlers(0));
ed.setActive(P[0].api);

/* ---------- Split ---------- */
const splitWrap  = $('#editor-split');
const splitPane1 = $('[data-pane="1"]');
const splitBtn   = $('#split-btn');

const setActive = i => {
    active = i;
    ed.setActive(P[i].api);
    $$('.ed-pane').forEach(p => p.classList.toggle('active', +p.dataset.pane === i));
    setStatusFile(P[i].cur);
    setSaved(!P[i].dirty);
};

splitBtn?.addEventListener('click', () => {
    const on = !splitWrap.classList.contains('split');
    splitWrap.classList.toggle('split', on);
    splitPane1.hidden = !on;

    if (on && !P[1].api) {
        P[1].api = ed.create($('#ed2'), makeHandlers(1));
        if (P[0].cur) {
            P[1].open = [P[0].cur];
            P[1].cur  = P[0].cur;
            P[1].api.set(fs.state.files[P[0].cur], langOf(P[0].cur));
            renderTabs(1);
        }
    }
    if (!on) setActive(0);
    else     setActive(active);
});

$$('.ed-pane').forEach(p => {
    p.addEventListener('pointerdown', () => setActive(+p.dataset.pane), true);
});

/* ---------- Модули UI ---------- */
pv.init($('#pv'), $('[data-p="preview"]'));
ui.initNav();
keyboard.init([$('#ed'), $('#ed2')]);
ui.resizers();
term.init($('#out'), $('#cmd'), {
    open: p => openIn(active, p),
    refresh
});

['/index.html', '/style.css', '/script.js']
    .filter(fs.isFile)
    .forEach(f => P[0].open.push(f));
openIn(0, P[0].open[0] || '/index.html');
refresh();

/* ================================================================
   Кнопки
   ================================================================ */
$('#run').onclick    = () => { pv.run(); ui.show('preview'); };
$('#save').onclick   = save;
$('#reload').onclick = () => pv.run();
$('#term-clear').onclick = () => { $('#out').innerHTML = ''; };

$('#nf').onclick = async () => {
    const v = await ui.prompt('Имя нового файла', 'untitled.js');
    if (v) {
        const p = '/' + v.replace(/^\/+/, '');
        fs.write(p);
        refresh();
        openIn(active, p);
    }
};
$('#nd').onclick = async () => {
    const v = await ui.prompt('Имя новой папки', 'src');
    if (v) { fs.mkdir('/' + v.replace(/^\/+/, '')); refresh(); }
};
$('#zip-exp').onclick = async () => {
    try { await exportZip(); ui.toast('Экспорт готов', 'ok'); }
    catch (e) { ui.toast('Экспорт: ' + e.message, 'err'); }
};

/* ---------- Форматирование ---------- */
$('#fmt').onclick = async () => {
    const st = P[active];
    if (!st.cur || !st.api) return;
    const btn = $('#fmt');
    btn.disabled = true;
    try {
        const t = await format(st.api.get(), langOf(st.cur));
        fs.write(st.cur, t);
        st.api.set(t, langOf(st.cur));
        st.dirty = true; setSaved(false);
        pv.schedule();
        ui.toast('Отформатировано', 'ok');
    } catch (e) {
        ui.toast('Format: ' + e.message, 'err');
    } finally {
        btn.disabled = false;
    }
};

/* ---------- Drag & drop ---------- */
const overlay = document.getElementById('drop-overlay');
let dragDepth = 0;

window.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragDepth++;
    overlay?.classList.add('on');
});
window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; overlay?.classList.remove('on'); }
});
window.addEventListener('dragover', e => e.preventDefault());

async function readEntry(entry, base) {
    if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        fs.write(base + entry.name, await file.text());
        return 1;
    }
    if (entry.isDirectory) {
        fs.mkdir(base + entry.name);
        const reader = entry.createReader();
        let count = 0, batch;
        do {
            batch = await new Promise(res => reader.readEntries(res));
            for (const e of batch) count += await readEntry(e, base + entry.name + '/');
        } while (batch.length);
        return count;
    }
    return 0;
}

window.addEventListener('drop', async e => {
    dragDepth = 0;
    overlay?.classList.remove('on');
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;

    const files = [...dt.files];
    const items = [...dt.items];

    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        try {
            await importZip(files[0]);
            refresh();
            if (fs.isFile('/index.html')) openIn(active, '/index.html');
            ui.toast('ZIP распакован', 'ok');
        } catch (err) { ui.toast('ZIP: ' + err.message, 'err'); }
        return;
    }

    let n = 0;
    try {
        for (const item of items) {
            const entry = item.webkitGetAsEntry?.();
            if (entry) n += await readEntry(entry, '/');
        }
    } catch (err) { ui.toast('Импорт: ' + err.message, 'err'); }

    if (n === 0 && files.length) {
        for (const f of files) {
            try { fs.write('/' + f.name, await f.text()); n++; } catch {}
        }
    }

    if (n) {
        refresh();
        if (fs.isFile('/index.html')) openIn(active, '/index.html');
        ui.toast(`Загружено файлов: ${n}`, 'ok');
    } else {
        ui.toast('Ничего не загружено', 'err');
    }
});

/* ================================================================
   Настройки — всё применяется сразу, «Готово» просто закрывает
   ================================================================ */
const D = $('#set');
const R = document.documentElement;
const MOBILE    = () => matchMedia('(max-width:899px), (max-height:500px)').matches;
const LANDSCAPE = () => matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
const get = (k, d) => localStorage.getItem(k) ?? d;
const KB_KEYS = ['kb-h', 'kb-gap', 'kb-op', 'kb-scale'];
const kbHeightDefault = () => (LANDSCAPE() ? 160 : 300);

const applyKb = () => {
    /* Высоту пишем инлайном только если её меняли — иначе остаётся CSS-дефолт (в т.ч. для ландшафта) */
    if (localStorage.getItem('kb-h')) R.style.setProperty('--kb-h', `min(${get('kb-h', 300)}px, 60vh)`);
    else R.style.removeProperty('--kb-h');
    R.style.setProperty('--kb-gap',   get('kb-gap', 3) + 'px');
    R.style.setProperty('--kb-op',    get('kb-op', 100) / 100);
    R.style.setProperty('--kb-scale', get('kb-scale', 100) / 100);

    const ext = get('ext-kb', '0') === '1';
    document.body.classList.toggle('ext-kb', ext);
    document.body.classList.toggle('no-status', get('status-bar', '1') === '0');
    if (ext) document.body.classList.remove('typing');
};
applyKb();

/* Пока настройки открыты на телефоне — показываем клавиатуру, чтобы видеть эффект ползунков */
const syncPreview = () => document.body.classList.toggle(
    'kb-preview', D.open && MOBILE() && get('ext-kb', '0') !== '1'
);

const RANGES = [
    { id: 's-kb-h',     key: 'kb-h',     def: kbHeightDefault, fmt: v => v + ' px', apply: applyKb },
    { id: 's-kb-gap',   key: 'kb-gap',   def: () => 3,         fmt: v => v + ' px', apply: applyKb },
    { id: 's-kb-op',    key: 'kb-op',    def: () => 100,       fmt: v => v + '%',   apply: applyKb },
    { id: 's-kb-scale', key: 'kb-scale', def: () => 100,       fmt: v => v + '%',   apply: applyKb },
    { id: 's-fs',       key: 'fs',       def: () => 14,        fmt: v => v + ' px', apply: v => ui.fontSize(v) }
];

const syncTheme = () => $$('#s-theme button').forEach(
    b => b.classList.toggle('on', b.dataset.v === document.body.dataset.theme)
);

const loadSettings = () => {
    syncTheme();
    RANGES.forEach(r => {
        const v = get(r.key, r.def());
        $('#' + r.id).value = v;
        $('#o-' + r.id.slice(2)).textContent = r.fmt(v);
    });
    $('#s-live').checked   = get('live', 'true') !== 'false';
    $('#s-ext-kb').checked = get('ext-kb', '0') === '1';
    $('#s-status').checked = get('status-bar', '1') !== '0';
};

RANGES.forEach(r => {
    const el = $('#' + r.id), out = $('#o-' + r.id.slice(2));
    el.oninput = () => {
        localStorage.setItem(r.key, el.value);
        out.textContent = r.fmt(el.value);
        r.apply(el.value);
    };
});

$$('#s-theme button').forEach(b => b.onclick = () => { ui.theme(b.dataset.v); syncTheme(); });

$('#s-status').onchange = e => {
    localStorage.setItem('status-bar', e.target.checked ? '1' : '0');
    applyKb();
};
$('#s-live').onchange = e => {
    localStorage.setItem('live', e.target.checked);
    pv.setLive(e.target.checked);
};
$('#s-ext-kb').onchange = e => {
    localStorage.setItem('ext-kb', e.target.checked ? '1' : '0');
    applyKb();
    ed.refreshInput();          /* inputmode редактора пересчитывается сразу */
    syncPreview();
};
$('#s-kb-def').onclick = () => {
    KB_KEYS.forEach(k => localStorage.removeItem(k));
    applyKb();
    loadSettings();
};

const openSettings = () => {
    loadSettings();
    if (MOBILE()) {
        D.show();                                  /* не модальный: клавиатура остаётся видимой */
        document.body.classList.add('settings-open');
    } else {
        D.showModal();
    }
    syncPreview();
};
D.addEventListener('close', () => document.body.classList.remove('settings-open', 'kb-preview'));
D.addEventListener('click', e => { if (e.target === D) D.close(); });   /* клик по подложке */

$('#gear').onclick    = openSettings;
$('#s-close').onclick = () => D.close();
$('#s-ok').onclick    = () => D.close();
$('#scrim').onclick   = () => { if (D.open) D.close(); ui.closeSheet(); };

let rzT;
window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { applyKb(); ed.refreshInput(); syncPreview(); }, 150);
});

$('#s-reset').onclick = async () => {
    D.close();
    if (await ui.confirmDlg('Сбросить проект?', 'Все файлы будут удалены.', true)) {
        fs.seed();
        P[0].open = []; P[0].cur = null;
        P[1].open = []; P[1].cur = null;
        P[1].api?.set('');
        refresh();
        openIn(0, '/index.html');
        ui.toast('Проект сброшен', 'ok');
    }
};

/* ================================================================
   Сворачивание панелей
   ================================================================ */
const mainEl   = $('#main');
const tglFiles = $('#tgl-files');
const tglTerm  = $('#tgl-term');
const tglHide  = $('#tgl-hide');
const burger   = $('#burger');

const applyCollapse = () => {
    mainEl.classList.toggle('files-hidden', localStorage.getItem('files-hidden') === '1');
    mainEl.classList.toggle('term-hidden',  localStorage.getItem('term-hidden')  === '1');
    document.body.classList.toggle('header-hidden', localStorage.getItem('header-hidden') === '1');
};

tglFiles.onclick = () => {
    const hide = !mainEl.classList.contains('files-hidden');
    mainEl.classList.toggle('files-hidden', hide);
    localStorage.setItem('files-hidden', hide ? '1' : '0');
    document.querySelector('[data-p="files"]')?.classList.remove('sheet');
};
tglTerm.onclick = () => {
    const hide = !mainEl.classList.contains('term-hidden');
    mainEl.classList.toggle('term-hidden', hide);
    localStorage.setItem('term-hidden', hide ? '1' : '0');
};
tglHide.onclick = () => {
    document.body.classList.add('header-hidden');
    localStorage.setItem('header-hidden', '1');
};
burger.onclick = () => {
    document.body.classList.remove('header-hidden');
    localStorage.setItem('header-hidden', '0');
};

if (!localStorage.getItem('webide-first')) {
    if (matchMedia('(max-width:899px), (max-height:500px)').matches) {
        localStorage.setItem('term-hidden', '1');
    }
    localStorage.setItem('webide-first', '1');
}
if (!localStorage.getItem('ui-v2')) {            /* старое автоскрытие могло оставить шапку скрытой */
    localStorage.setItem('header-hidden', '0');
    localStorage.setItem('ui-v2', '1');
}
applyCollapse();

/* ================================================================
   Горячие клавиши
   ================================================================ */
window.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 's')     { e.preventDefault(); save(); }
    if (mod && e.key === 'Enter') { e.preventDefault(); pv.run(); ui.show('preview'); }
    if (mod && e.key === 'p')     { e.preventDefault(); ui.show('files'); }
    if (mod && e.key === 'b')     { e.preventDefault(); tglFiles.click(); }
    if (mod && e.key === '`')     { e.preventDefault(); tglTerm.click(); }
    if (mod && e.key === '\\')    { e.preventDefault(); splitBtn?.click(); }
});

/* ---------- iOS: --vh фолбэк ---------- */
if (!CSS.supports('height', '100dvh')) {
    const setVH = () => document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
    setVH();
    window.addEventListener('resize', setVH, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(setVH, 120));
}

/* ---------- Меню-поповер ---------- */
const menuBtn = document.getElementById('menu-btn');
const menuPop = document.getElementById('menu-popup');
const closeMenu = () => menuPop?.classList.remove('on');

menuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    menuPop.classList.toggle('on');
});
menuPop?.querySelectorAll('button').forEach(b => b.addEventListener('click', closeMenu));
document.addEventListener('click', e => {
    if (!menuPop?.contains(e.target) && !menuBtn?.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeMenu();
    if (D.open && !D.matches(':modal')) D.close();
    ui.closeSheet();
});