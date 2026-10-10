import * as fs from './fs.js';
import { isMobile } from './platform.js';

const $$ = s => [...document.querySelectorAll(s)];
const T = ['editor', 'preview', 'terminal'];   /* порядок свайпа */

/* ---------- Иконки ---------- */
const iconFor = (name, dir) => {
    if (dir) return `<svg class="icon-dir" viewBox="0 0 24 24" width="14" height="14"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const cls = { html: 'icon-html', css: 'icon-css', js: 'icon-js', mjs: 'icon-js', json: 'icon-json' }[ext] || 'icon-file';
    return `<svg class="${cls}" viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
};

/* ---------- Навигация между секциями ---------- */
let _cur = 'editor';
let _onShow = null;
export const onShow = fn => { _onShow = fn; };

function syncTabs() {
    const sheet = document.body.classList.contains('sheet-open');
    $$('#section-tabs button').forEach(b =>
        b.classList.toggle('on', sheet ? b.dataset.t === 'files' : b.dataset.t === _cur));
}

/* Лист «Файлы» (mobile): открыт/закрыт + затемнение за ним */
export const setSheet = on => {
    document.querySelector('[data-p="files"]')?.classList.toggle('sheet', on);
    document.body.classList.toggle('sheet-open', on);
    syncTabs();
};
export const closeSheet = () => setSheet(false);

export const show = n => {
    const mobile = isMobile();

    if (mobile && n === 'files') {
        document.body.classList.remove('typing', 'kb-term');
        setSheet(!document.body.classList.contains('sheet-open'));
        return;
    }
    if (mobile) setSheet(false);
    /* Экранная клавиатура живёт над кодом и над терминалом, но не над превью/файлами. */
    if (n !== 'editor' && n !== 'terminal') document.body.classList.remove('typing', 'kb-term');

    _cur = n;
    $$('main > section').forEach(s => s.classList.toggle('on', s.dataset.p === n));
    syncTabs();
    _onShow?.(n);
};

export function initNav() {
    $$('#section-tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
    show('editor');

    /* Свайп между «Код / Превью / Терм». Только горизонтальный жест. */
    let x0 = null, y0 = 0;
    const m = document.querySelector('main');
    m.addEventListener('touchstart', e => {
        const skip = e.target.closest('.cm-editor, #out, #cmd, iframe, .preview-stage, .tabbar, .seg, [data-p="files"]');
        x0 = skip ? null : e.touches[0].clientX;
        y0 = e.touches[0].clientY;
    }, { passive: true });
    m.addEventListener('touchend', e => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (!isMobile() || Math.abs(dx) < 80 || Math.abs(dy) > 60) return;
        const i = T.indexOf(_cur);
        if (i < 0) return;
        show(T[Math.max(0, Math.min(T.length - 1, i + (dx < 0 ? 1 : -1)))]);
    }, { passive: true });
}

/* ---------- Тема / размер шрифта ---------- */
export function theme(t) {
    document.body.dataset.theme = t;
    localStorage.setItem('theme', t);
    const bg = getComputedStyle(document.body).getPropertyValue('--bg-0').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
export function fontSize(n) {
    document.documentElement.style.setProperty('--fs', n + 'px');
    localStorage.setItem('fs', n);
}

/* ---------- Диалог prompt ---------- */
export function prompt(title, defaultValue = '') {
    return new Promise(resolve => {
        const d = document.getElementById('prompt-dialog');
        const input = document.getElementById('prompt-input');
        document.body.classList.remove('typing', 'kb-term');
        document.getElementById('prompt-title').textContent = title;
        input.value = defaultValue;
        d.showModal();
        setTimeout(() => { input.focus(); input.select(); }, 30);
        d.addEventListener('close', () => {
            resolve(d.returnValue === 'ok' ? input.value.trim() : null);
        }, { once: true });
    });
}

/* ---------- Диалог confirm ---------- */
export function confirmDlg(title, text = '', danger = false) {
    return new Promise(resolve => {
        const d  = document.getElementById('confirm-dialog');
        const ok = document.getElementById('confirm-ok');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-text').textContent  = text;
        ok.className = 'btn ' + (danger ? 'danger' : 'primary');
        d.showModal();
        d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    });
}

/* ---------- Toast ---------- */
let toastT;
export function toast(msg, kind = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = kind;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------- Контекстное меню ---------- */
const svgEdit  = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
const svgCopy  = `<svg viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const svgTrash = `<svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const svgFile  = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

const menuFor = (q, n, dir, change) => {
    const items = [
        { label: 'Переименовать', icon: svgEdit, action: async () => {
                const v = await prompt('Новое имя', n);
                if (v && v !== n) { fs.mv(q, q.replace(/[^/]+$/, v)); change(); }
            }},
        { label: 'Дублировать', icon: svgCopy, action: () => { fs.cp(q, q + (dir ? '-copy' : '.copy')); change(); }},
        { label: 'Удалить', icon: svgTrash, danger: true, action: async () => {
                if (await confirmDlg('Удалить «' + n + '»?', 'Действие необратимо.', true)) {
                    fs.rm(q); change();
                }
            }}
    ];
    if (!dir && navigator.share) items.splice(1, 0, { label: 'Поделиться', icon: svgFile, action: async () => {
            try {
                const f = new File([fs.state.files[q] ?? ''], n, { type: 'text/plain' });
                if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: n });
                else await navigator.share({ title: n, text: fs.state.files[q] ?? '' });
            } catch (e) { if (e.name !== 'AbortError') toast('Поделиться: ' + e.message, 'err'); }
        }});
    if (dir) items.unshift({ label: 'Новый файл', icon: svgFile, action: async () => {
            const v = await prompt('Имя файла');
            if (v) { fs.write(q + '/' + v); change(); }
        }});
    return items;
};

export function showCtxMenu(x, y, items) {
    const menu = document.getElementById('ctx-menu');
    menu.innerHTML = '';
    items.forEach(item => {
        const btn = document.createElement('button');
        if (item.danger) btn.className = 'danger';
        if (item.icon) btn.insertAdjacentHTML('beforeend', item.icon);
        const span = document.createElement('span');
        span.textContent = item.label;
        btn.append(span);
        btn.onclick = ev => {
            ev.stopPropagation();
            item.action();
            menu.style.display = 'none';
        };
        menu.append(btn);
    });
    menu.style.display = 'flex';
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - menu.offsetHeight - 10) + 'px';
}

document.addEventListener('click', () => {
    const m = document.getElementById('ctx-menu');
    if (m) m.style.display = 'none';
});

/* ---------- Дерево файлов ---------- */
const MIME = 'application/x-webide-path';
const COLL_KEY = 'tree-collapsed';
const collapsed = new Set(JSON.parse(localStorage.getItem(COLL_KEY) || '[]'));
const saveColl = () => localStorage.setItem(COLL_KEY, JSON.stringify([...collapsed]));
const chevron = open => `<svg class="chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none;transition:transform .12s;transform:rotate(${open ? 90 : 0}deg)"><polyline points="9 6 15 12 9 18"/></svg>`;
const spacer = '<span style="display:inline-block;width:12px;flex:none"></span>';
const baseName = p => p.slice(p.lastIndexOf('/') + 1);
const join = (d, n) => (d === '/' ? '' : d) + '/' + n;

let dragActive = false, suppressClick = false;

const scrollParent = el => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return el.parentElement || el;
};

const moveEntry = (src, destDir, { change, moved }) => {
    const dst = join(destDir, baseName(src));
    if (dst === src) return;
    if (destDir === src || destDir.startsWith(src + '/')) return toast('Нельзя переместить папку в саму себя', 'err');
    if (fs.isFile(dst) || fs.isDir(dst)) return toast('«' + baseName(src) + '» уже есть в этой папке', 'err');
    fs.mv(src, dst);
    collapsed.delete(destDir); saveColl();
    moved?.(src, dst);
    change();
};

/* Папка, в которую упадёт элемент, если отпустить над target */
const dropDirOf = target => {
    const li = target?.closest?.('li');
    if (!li) return '/';
    const p = li.dataset.path;
    return li.dataset.dir === '1' ? p : (p.slice(0, p.lastIndexOf('/')) || '/');
};

export function tree(el, opts) {
    const { open, change, current } = opts;
    const sc = scrollParent(el);
    const top = sc.scrollTop;
    /* никакого выделения текста и системного колбэка по долгому тапу */
    el.style.userSelect = el.style.webkitUserSelect = 'none';
    el.style.webkitTouchCallout = 'none';
    el.innerHTML = '';
    const fine = matchMedia('(pointer: fine)').matches;

    const mark = dir => {
        el.style.outline = dir === '/' ? '1px dashed var(--accent, #7aa2f7)' : '';
        el.querySelectorAll('li').forEach(l => {
            l.style.outline = (dir && dir !== '/' && l.dataset.path === dir) ? '1px dashed var(--accent, #7aa2f7)' : '';
        });
    };

    const walk = (d, lv) => {
        fs.list(d).forEach(n => {
            const q = join(d, n), dir = fs.isDir(q), isOpen = dir && !collapsed.has(q);
            const li = document.createElement('li');
            li.dataset.path = q;
            li.dataset.dir = dir ? '1' : '0';
            li.style.paddingLeft = (lv * 14) + 'px';
            if (!dir && q === current) li.classList.add('active');

            const b = document.createElement('button');
            b.className = 'n';
            b.insertAdjacentHTML('beforeend', (dir ? chevron(isOpen) : spacer) + iconFor(n, dir));
            const nm = document.createElement('span');
            nm.textContent = n;
            b.append(nm);

            b.onclick = e => {
                e.stopPropagation();
                if (suppressClick) return;                 /* отпускание после долгого тапа / драга */
                if (dir) {
                    isOpen ? collapsed.add(q) : collapsed.delete(q);
                    saveColl();
                    tree(el, opts);
                } else open(q);
            };

            li.oncontextmenu = e => {
                e.preventDefault(); e.stopPropagation();
                if (e.pointerType === 'touch' || !fine) return;   /* на тачах меню открывает долгий тап (см. ниже) */
                showCtxMenu(e.clientX, e.clientY, menuFor(q, n, dir, change));
            };

            if (fine) {                                    /* мышь / трекпад: обычный HTML5 drag */
                li.draggable = true;
                li.ondragstart = e => {
                    const dt = e.dataTransfer;
                    dt.setData(MIME, q);
                    dt.setData('text/plain', dir ? q : (fs.state.files[q] ?? ''));
                    if (!dir) {      /* Chrome/Edge на десктопе: можно утащить файлом на рабочий стол */
                        const url = URL.createObjectURL(new Blob([fs.state.files[q] ?? ''], { type: 'text/plain' }));
                        dt.setData('DownloadURL', `text/plain:${n}:${url}`);
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                    }
                    dt.effectAllowed = 'copyMove';
                };
                li.ondragend = () => mark(null);
            }

            li.append(b);
            el.append(li);
            if (isOpen) walk(q, lv + 1);
        });
    };
    walk('/', 0);
    sc.scrollTop = top;                                    /* перерисовка не сбрасывает прокрутку → ничего не «трясётся» */

    /* ---- drop (мышь) ---- */
    el.ondragover = e => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        mark(dropDirOf(e.target));
    };
    el.ondragleave = e => { if (!el.contains(e.relatedTarget)) mark(null); };
    el.ondrop = e => {
        const src = e.dataTransfer.getData(MIME);
        if (!src) return;
        e.preventDefault(); e.stopPropagation();
        const dest = dropDirOf(e.target);
        mark(null);
        moveEntry(src, dest, opts);
    };

    /* ---- тач: долгий тап → «взяли»; отпустили без движения → меню; потащили → драг ---- */
    if (!el._tm) {
        el._tm = true;
        el.addEventListener('touchmove', e => { if (dragActive) e.preventDefault(); }, { passive: false });
    }
    el.onpointerdown = e => {
        if (e.pointerType === 'mouse') return;
        const li = e.target.closest('li');
        if (!li) return;
        const q = li.dataset.path, n = baseName(q), dir = li.dataset.dir === '1';
        const x0 = e.clientX, y0 = e.clientY;
        let px = x0, py = y0, held = false, dragging = false, ghost = null, dest = null, raf = 0;

        const timer = setTimeout(() => {
            held = true; dragActive = true;
            navigator.vibrate?.(12);
            li.style.opacity = '.55';
        }, 420);

        const destAt = (x, y) => {
            const t = document.elementFromPoint(x, y);
            return t && (t === el || el.contains(t)) ? dropDirOf(t) : null;
        };
        const loop = () => {
            if (!dragging) return;
            const r = sc.getBoundingClientRect();
            if (py < r.top + 40) sc.scrollTop -= 8;
            else if (py > r.bottom - 40) sc.scrollTop += 8;
            dest = destAt(px, py);
            mark(dest);
            raf = requestAnimationFrame(loop);
        };
        const finish = () => {
            clearTimeout(timer);
            cancelAnimationFrame(raf);
            ghost?.remove();
            mark(null);
            li.style.opacity = '';
            dragActive = false;
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', finish);
            if (held) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 350); }
        };
        const move = ev => {
            px = ev.clientX; py = ev.clientY;
            const dist = Math.hypot(px - x0, py - y0);
            if (!held) { if (dist > 8) finish(); return; }          /* это скролл, не драг */
            if (!dragging && dist > 6) {
                dragging = true;
                ghost = document.createElement('div');
                ghost.textContent = n;
                ghost.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;padding:4px 10px;border-radius:6px;background:var(--bg-2,#333);color:var(--fg-1,#fff);font:12px system-ui;pointer-events:none;opacity:.92;box-shadow:0 4px 14px rgba(0,0,0,.4)';
                document.body.append(ghost);
                loop();
            }
            if (dragging) ghost.style.transform = `translate(${px + 12}px,${py - 18}px)`;
        };
        const up = ev => {
            const wasHeld = held, wasDrag = dragging, target = dest;
            finish();
            if (wasHeld && !wasDrag) showCtxMenu(ev.clientX, ev.clientY, menuFor(q, n, dir, change));
            else if (wasDrag && target) moveEntry(q, target, opts);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', finish);
    };
}

/* ---------- Ресайзеры ---------- */
export function resizers() {
    $$('.rz').forEach(h => {
        h.onpointerdown = e => {
            e.preventDefault();
            h.setPointerCapture(e.pointerId);
            const x0 = e.clientX;
            const w0 = h.parentElement.offsetWidth;
            const inv = h.dataset.inv;
            h.onpointermove = v => {
                const w = Math.max(160, w0 + (inv ? -1 : 1) * (v.clientX - x0));
                document.documentElement.style.setProperty(h.dataset.v, w + 'px');
            };
            h.onpointerup = () => { h.onpointermove = null; };
        };
    });

    $$('.rz-h').forEach(h => {
        h.onpointerdown = e => {
            e.preventDefault();
            h.setPointerCapture(e.pointerId);
            const y0 = e.clientY;
            const h0 = h.parentElement.offsetHeight;
            h.onpointermove = v => {
                const delta = y0 - v.clientY;
                const nh = Math.max(80, Math.min(window.innerHeight - 200, h0 + delta));
                document.documentElement.style.setProperty('--h-term', nh + 'px');
            };
            h.onpointerup = () => { h.onpointermove = null; };
        };
    });
}