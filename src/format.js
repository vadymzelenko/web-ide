const L = u => new Promise((r, j) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3/' + u;
    s.onload = r;
    s.onerror = () => j(Error('Prettier недоступен (нет сети)'));
    document.head.append(s);
});

export async function format(text, lang) {
    const parser = { html: 'html', css: 'css', js: 'babel' }[lang];
    if (!parser) throw Error('формат не поддержан');
    if (!window.prettier) {
        await L('standalone.js');
        await Promise.all(['html', 'postcss', 'babel', 'estree'].map(n => L(`plugins/${n}.js`)));
    }
    return prettier.format(text, { parser, plugins: Object.values(prettierPlugins), tabWidth: 2 });
}