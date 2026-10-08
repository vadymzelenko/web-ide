import * as fs from './fs.js';

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
const isMobile = () => matchMedia('(max-width:899px), (max-height:500px)').matches;
let _cur = 'editor';

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
        document.body.classList.remove('typing');
        setSheet(!document.body.classList.contains('sheet-open'));
        return;
    }
    if (mobile) setSheet(false);
    if (n !== 'editor') document.body.classList.remove('typing');   /* клава только над кодом */

    _cur = n;
    $$('main > section').forEach(s => s.classList.toggle('on', s.dataset.p === n));
    syncTabs();
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
        document.body.classList.remove('typing');
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
export function tree(el, { open, change, current }) {
    el.innerHTML = '';
    const walk = (d, lv) => {
        fs.list(d).forEach(n => {
            const q = (d === '/' ? '' : d) + '/' + n;
            const dir = fs.isDir(q);
            const li = document.createElement('li');
            li.style.paddingLeft = (lv * 14) + 'px';
            if (!dir && q === current) li.classList.add('active');

            const b = document.createElement('button');
            b.className = 'n';
            b.insertAdjacentHTML('beforeend', iconFor(n, dir));
            const nm = document.createElement('span');
            nm.textContent = n;
            b.append(nm);

            let fired = false;
            b.onclick = e => {
                e.stopPropagation();
                if (fired) { fired = false; return; }   /* это был долгий тап */
                if (!dir) open(q);
            };

            li.oncontextmenu = e => {
                e.preventDefault(); e.stopPropagation();
                showCtxMenu(e.clientX, e.clientY, menuFor(q, n, dir, change));
            };

            let timer = 0;
            const cancel = () => { clearTimeout(timer); timer = 0; };
            li.ontouchstart = e => {
                cancel();
                fired = false;
                timer = setTimeout(() => {
                    fired = true;
                    const t = e.touches[0];
                    showCtxMenu(t.clientX, t.clientY, menuFor(q, n, dir, change));
                }, 500);
            };
            li.ontouchend = cancel;
            li.ontouchmove = cancel;
            li.ontouchcancel = cancel;

            li.append(b);
            el.append(li);
            if (dir) walk(q, lv + 1);
        });
    };
    walk('/', 0);
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