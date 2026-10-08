import { state } from './fs.js';

const F = n => state.files['/' + n.replace(/^\.?\//, '')];

let pv, tm;
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

export const run = () => {
    if (!pv) return;
    pv.parentElement?.classList.add('updating');
    pv.srcdoc = build();
};

export const init = (el, sec) => {
    pv = el;
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
        setTimeout(run, 50);
    };
    run();
};

export const schedule = () => {
    if (!auto) return;
    clearTimeout(tm);
    tm = setTimeout(run, 300);
};
export const setLive = v => { auto = v; if (v) schedule(); };