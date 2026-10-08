const idb = (m, v) => new Promise((res, rej) => {
    const o = indexedDB.open('webide', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('s');
    o.onerror = rej;
    o.onsuccess = () => {
        const s = o.result.transaction('s', m === 'get' ? 'readonly' : 'readwrite').objectStore('s');
        const r = m === 'get' ? s.get('p') : s.put(v, 'p');
        r.onsuccess = () => res(r.result);
        r.onerror = rej;
    };
});

export const state = {files: {}, dirs: new Set()};

export const resolve = (cwd, p = '') => {
    const o = [];
    for (const s of (p[0] === '/' ? [] : cwd.split('/')).concat(p.split('/'))) {
        if (!s || s === '.') continue;
        s === '..' ? o.pop() : o.push(s);
    }
    return '/' + o.join('/');
};

export const isDir = p => p === '/' || state.dirs.has(p);
export const isFile = p => p in state.files;

export const list = p => {
    const pre = p === '/' ? '/' : p + '/';
    const s = new Set();
    for (const f of [...Object.keys(state.files), ...state.dirs]) {
        if (f.startsWith(pre) && f !== p) s.add(f.slice(pre.length).split('/')[0]);
    }
    return [...s].sort();
};

const anc = p => {
    const a = p.split('/').filter(Boolean);
    for (let i = 1; i < a.length; i++) state.dirs.add('/' + a.slice(0, i).join('/'));
};

let t;
export const save = () => {
    clearTimeout(t);
    t = setTimeout(() => idb('put', {files: state.files, dirs: [...state.dirs]}), 200);
};

export const write = (p, c = '') => {
    anc(p);
    state.files[p] = c;
    save();
};
export const mkdir = p => {
    anc(p + '/x');
    save();
};
export const rm = p => {
    for (const f of Object.keys(state.files)) if (f === p || f.startsWith(p + '/')) delete state.files[f];
    for (const d of [...state.dirs]) if (d === p || d.startsWith(p + '/')) state.dirs.delete(d);
    save();
};
export const cp = (a, b) => {
    for (const f of Object.keys(state.files)) if (f === a || f.startsWith(a + '/')) write(b + f.slice(a.length), state.files[f]);
    for (const d of [...state.dirs]) if (d === a || d.startsWith(a + '/')) state.dirs.add(b + d.slice(a.length));
};
export const mv = (a, b) => {
    cp(a, b);
    rm(a);
};

export const seed = () => {
    state.files = {};
    state.dirs = new Set();
    write('/index.html', '<!doctype html>\n<html>\n<head>\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<h1>Hello, WebIDE</h1>\n<button id="b">Click</button>\n<script src="script.js"></script>\n</body>\n</html>');
    write('/style.css', 'body{font-family:system-ui;padding:1rem}\nbutton{padding:.8rem 1.2rem}');
    write('/script.js', 'document.getElementById("b").onclick=()=>alert("Works!");');
};

export const load = async () => {
    const d = await idb('get').catch(() => null);
    if (d) {
        state.files = d.files;
        state.dirs = new Set(d.dirs);
    } else seed();
};

export const clear = () => {
    state.files = {};
    state.dirs = new Set();
    save();
};