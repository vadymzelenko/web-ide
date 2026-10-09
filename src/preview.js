import { state } from './fs.js';

const F = n => state.files['/' + n.replace(/^\.?\//, '')];

let pv, sec, tm;
let stale = false;                       /* превью устарело, пока секция была скрыта */
let auto = localStorage.getItem('live') !== 'false';

export const build = () => {
    let html = F('index.html') || '<!doctype html><html><body><p>Нет index.html</p></body></html>';

    html = html.replace(/<link[^>]+href=["']([^"':]+\.css)["'][^>]*>/g, (m, f) => {
        const c = F(f);
        return c != null ? `<style>${c}</style>` : m;
    });

    html = html.replace(/<script([^>]*?)src=["']([^"':]+\.js)["']([^>]*)><\/script>/g, (m, a, f, b) => {
        const c = F(f);
        return c != null ? `<script${a}${b}>${c.replace(/<\/script/g, '<\\/script')}<\/script>` : m;
    });

    return html;
};

/* Секция видна? (на мобиле неактивные секции — display:none, у них нет боксов) */
const visible = () => !sec || sec.getClientRects().length > 0;

/* force=true — перезапустить, даже если секция скрыта */
export const run = force => {
    if (!pv) return;
    if (force !== true && !visible()) { stale = true; return; }   /* не гоняем скрытый iframe */
    stale = false;
    pv.parentElement?.classList.add('updating');
    pv.srcdoc = build();
};

/* Когда секция снова стала видимой — догоняем накопленные изменения */
export const flushIfStale = () => { if (stale && visible()) run(true); };

export const init = (el, section) => {
    pv = el;
    sec = section;
    if (!el.parentElement.querySelector('#pv-badge')) {
        const badge = document.createElement('div');
        badge.id = 'pv-badge';
        badge.textContent = 'LIVE';
        el.parentElement.append(badge);
    }
    el.addEventListener('load', () => {
        setTimeout(() => el.parentElement?.classList.remove('updating'), 200);
    });
    sec.querySelectorAll('[data-w]').forEach(b => {
        b.onclick = () => {
            pv.style.width = b.dataset.w;
            sec.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === b));
        };
    });
    sec.querySelector('#full').onclick = () => {
        sec.classList.toggle('full');
        setTimeout(() => run(true), 50);
    };

    /* ui.show() переключает класс .on у секций — ловим момент показа превью,
       main.js / ui.js менять не нужно */
    new MutationObserver(flushIfStale).observe(sec, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', flushIfStale);

    run();
};

export const schedule = () => {
    if (!auto) return;
    clearTimeout(tm);
    tm = setTimeout(run, 300);
};
export const setLive = v => { auto = v; if (v) schedule(); };