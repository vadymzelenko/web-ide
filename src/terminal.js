import * as fs from './fs.js';

const C = 'ls cd mkdir touch rm rmdir cat echo mv cp pwd clear help edit tree'.split(' ');

export function init(out, inp, { open, refresh }) {
    let cwd = '/', h = [], hi = 0;

    const p = (s, cls) => {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = s;
        out.append(d);
        out.scrollTop = 1e9;
    };

    const R = x => fs.resolve(cwd, x);
    const tree = (d, pre = '') => fs.list(d).flatMap((n, i, a) => {
        const q = (d === '/' ? '' : d) + '/' + n, l = i === a.length - 1;
        return [pre + (l ? '└─ ' : '├─ ') + n, ...(fs.isDir(q) ? tree(q, pre + (l ? '   ' : '│  ')) : [])];
    });
    const dest = (a, b) => fs.isDir(R(b)) ? R(b) + '/' + a.split('/').pop() : R(b);

    const run = l => {
        p(`${cwd} $ ${l}`, 't-cmd');
        const m = l.match(/^echo\s+(.*?)\s*>\s*(\S+)$/);
        if (m) { fs.write(R(m[2]), m[1].replace(/^["']|["']$/g, '')); return refresh(); }

        const [c, ...a0] = l.trim().split(/\s+/), a = a0.filter(x => x[0] !== '-'), x = R(a[0]);
        try {
            switch (c) {
                case '': break;
                case 'ls': { const d = R(a[0] || '.'); p(fs.list(d).map(n => fs.isDir((d === '/' ? '' : d) + '/' + n) ? n + '/' : n).join('  ')); break; }
                case 'cd': if (!fs.isDir(x)) throw Error('нет такой папки'); cwd = x; break;
                case 'pwd': p(cwd); break;
                case 'clear': out.innerHTML = ''; break;
                case 'mkdir': fs.mkdir(x); break;
                case 'touch': if (!fs.isFile(x)) fs.write(x); break;
                case 'rm': case 'rmdir': fs.rm(x); break;
                case 'cat': if (!fs.isFile(x)) throw Error('нет файла'); p(fs.state.files[x]); break;
                case 'mv': fs.mv(x, dest(x, a[1])); break;
                case 'cp': fs.cp(x, dest(x, a[1])); break;
                case 'edit': if (!fs.isFile(x)) fs.write(x); open(x); break;
                case 'tree': p(cwd + '\n' + tree(cwd).join('\n')); break;
                case 'help': p('┌────────────────────────┐\n│ ' + C.join(' ') + '\n└────────────────────────┘'); break;
                default: throw Error('команда не найдена');
            }
        } catch (e) { p(`${c}: ${e.message}`, 't-err'); }
        refresh();
    };

    inp.onkeydown = e => {
        if (e.key === 'Enter') {
            const l = inp.value; inp.value = '';
            if (l.trim()) h.push(l); hi = h.length;
            run(l);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault(); hi = Math.max(hi - 1, 0); inp.value = h[hi] ?? '';
        } else if (e.key === 'ArrowDown') {
            e.preventDefault(); hi = Math.min(hi + 1, h.length); inp.value = h[hi] ?? '';
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const t = inp.value.split(' '), w = t.pop(), pool = t.length ? fs.list(cwd) : C;
            const r = pool.filter(s => s.startsWith(w));
            if (r.length === 1) inp.value = [...t, r[0]].join(' ');
            else if (r.length) p(r.join('  '));
        }
    };
    p('[OK] fs mounted · [OK] type help', 't-dim');
}