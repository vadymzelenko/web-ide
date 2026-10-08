import * as fs from './fs.js';

const lib = () => window.JSZip ? Promise.resolve() : new Promise((r, j) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = r;
    s.onerror = () => j(Error('JSZip недоступен (нет сети)'));
    document.head.append(s);
});

export async function exp() {
    await lib();
    const z = new JSZip();
    for (const d of fs.state.dirs) z.folder(d.slice(1));
    for (const [p, c] of Object.entries(fs.state.files)) z.file(p.slice(1), c);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await z.generateAsync({type: 'blob'}));
    a.download = 'project.zip';
    a.click();
}

export async function imp(file) {
    await lib();
    const z = await JSZip.loadAsync(file);
    const it = [];
    for (const [n, e] of Object.entries(z.files)) {
        if (!n.startsWith('__MACOSX')) {
            it.push([fs.resolve('/', n), e.dir ? null : await e.async('string')]);
        }
    }
    fs.clear();
    for (const [p, c] of it) c == null ? fs.mkdir(p) : fs.write(p, c);
}