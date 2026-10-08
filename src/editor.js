import {
    basicSetup,
    EditorView, keymap, drawSelection,
    EditorState,
    indentWithTab,
    html, css, javascript,
    autocompletion,
    HighlightStyle, syntaxHighlighting,
    tags
} from './vendor/codemirror.js';

/* ---------- IntelliSense ---------- */
const JS_KEYWORDS = [
    'function','const','let','var','return','if','else','for','while','do','switch','case',
    'break','continue','new','class','extends','super','import','export','default','try',
    'catch','finally','throw','async','await','typeof','instanceof','in','of','this','null',
    'true','false','undefined','yield','delete','void','debugger','static','get','set',
    'console.log','console.warn','console.error','console.info',
    'document','window','localStorage','sessionStorage','navigator',
    'Math','JSON','Array','Object','String','Number','Boolean','Promise',
    'fetch','setTimeout','setInterval','clearTimeout','requestAnimationFrame',
    'querySelector','querySelectorAll','addEventListener','removeEventListener',
    'appendChild','createElement','getElementById','classList',
    'innerHTML','textContent','preventDefault','stopPropagation',
    'parseInt','parseFloat','isNaN','JSON.parse','JSON.stringify',
    'Math.random','Math.floor','Math.ceil','Math.round','Math.max','Math.min','Math.abs',
    'Array.isArray','then','length','push','map','filter','reduce','forEach','find',
    'includes','indexOf','split','join','slice','splice','replace','match','test','toString'
];
const HTML_KEYWORDS = [
    'html','head','body','title','meta','link','style','script','div','span','p','a','img',
    'button','input','form','label','h1','h2','h3','h4','h5','h6','ul','li','ol','table',
    'tr','td','th','section','header','footer','nav','main','article','aside','iframe',
    'canvas','video','audio','br','hr','svg','class','id','src','href','alt','type','name',
    'value','style','onclick','onload','disabled','placeholder'
];
const CSS_KEYWORDS = [
    'color','background','background-color','margin','padding','border','border-radius',
    'width','height','min-width','min-height','max-width','max-height','display','flex',
    'grid','position','top','left','right','bottom','font-size','font-family','font-weight',
    'text-align','line-height','gap','overflow','transform','transition','opacity','z-index',
    'box-shadow','text-shadow','flex-direction','justify-content','align-items','cursor',
    'pointer-events','white-space','word-break','list-style','outline','border-color',
    'border-width','border-style'
];

const collectVars = doc => {
    const s = new Set();
    for (const m of doc.toString().matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
    return [...s];
};

const makeSource = lang => context => {
    const word = context.matchBefore(/[\w$.-]*/);
    if (!word || (!word.text && !context.explicit)) return null;
    const base = lang === 'css' ? CSS_KEYWORDS : lang === 'html' ? HTML_KEYWORDS : JS_KEYWORDS;
    const pool = [...new Set([...base, ...collectVars(context.state.doc)])];
    const list = pool.filter(k => k.startsWith(word.text) && k !== word.text);
    if (!list.length) return null;
    return {
        from: word.from,
        options: list.slice(0, 24).map(label => ({
            label,
            type: base.includes(label) ? 'keyword' : 'variable',
            apply: label
        }))
    };
};

/* ---------- Платформа ---------- */
const isMobile = () => typeof matchMedia !== 'undefined'
    && matchMedia('(max-width: 899px), (max-height: 500px)').matches;

/* Своя клавиатура включена: мобильный экран и не стоит «внешняя клавиатура» */
const customKb = () => isMobile() && localStorage.getItem('ext-kb') !== '1';

/* Функция, а не объект: значение пересчитывается при каждом обновлении,
   поэтому настройки и поворот экрана работают без перезагрузки. */
const contentAttributes = EditorView.contentAttributes.of(() => ({
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    ...(customKb() ? { inputmode: 'none' } : {})
}));

const instances = new Set();

/* ---------- Стили ---------- */
const highlight = HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--syn-kw)' },
    { tag: [tags.name, tags.propertyName], color: 'var(--syn-var)' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: 'var(--syn-fn)' },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: 'var(--syn-con)' },
    { tag: [tags.definition(tags.name), tags.separator], color: 'var(--syn-fn)' },
    { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syn-typ)' },
    { tag: [tags.number, tags.bool, tags.atom, tags.null], color: 'var(--syn-num)' },
    { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp], color: 'var(--syn-op)' },
    { tag: [tags.meta, tags.comment], color: 'var(--syn-cmt)', fontStyle: 'italic' },
    { tag: tags.string, color: 'var(--syn-str)' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.heading, fontWeight: 'bold', color: 'var(--syn-fn)' },
    { tag: tags.invalid, color: 'var(--err)' }
]);

const theme = EditorView.theme({
    '&': { background: 'var(--bg-1)', color: 'var(--fg-1)', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overscrollBehavior: 'contain' },
    '.cm-content': { caretColor: 'var(--ac-1)', padding: '12px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ac-1)', borderLeftWidth: '2px' },
    '.cm-gutters': { background: 'var(--bg-1)', color: 'var(--fg-4)', border: 0, paddingRight: '8px', userSelect: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
    '.cm-activeLine': { background: 'color-mix(in srgb, var(--ac-1) 5%, transparent)' },
    '.cm-activeLineGutter': { background: 'transparent', color: 'var(--fg-2)' },
    '.cm-selectionBackground, ::selection': { background: 'color-mix(in srgb, var(--ac-1) 30%, transparent) !important' },
    '.cm-tooltip': { background: 'var(--bg-2)', border: '1px solid var(--bd-2)', borderRadius: '6px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--ac-1)', color: 'var(--ac-fg)' },
    '.cm-panels': { background: 'var(--bg-2)', color: 'var(--fg-1)' },
    '.cm-foldGutter': { color: 'var(--fg-3)' }
});

/* ---------- Языки (ленивая инициализация) ---------- */
const langs = { ready: false };
const initLangs = () => {
    if (langs.ready) return;
    try {
        langs.html = html();
        langs.css  = css();
        langs.js   = javascript();
        langs.ready = true;
    } catch (e) { console.warn('langs init:', e); }
};

/* ================================================================
   Фабрика: создаёт независимый редактор на элементе el.
   Возвращает api { set, get, focus, blur, insert, newline, indent,
                    backspace, moveCursor, moveLine, revealCursor, view }
   ================================================================ */
export function create(el, {
    onChange = () => {},
    onSave,
    onRun,
    onCursor
} = {}) {
    const api = { el };
    instances.add(api);
    let view = null;
    let ta = null;

    try {
        initLangs();

        view = new EditorView({ parent: el, state: EditorState.create({ doc: '' }) });

        const makeState = (doc, lang) => EditorState.create({
            doc,
            extensions: [
                basicSetup,
                theme,
                syntaxHighlighting(highlight),
                drawSelection(),
                langs[lang] || [],
                contentAttributes,
                autocompletion({ override: [makeSource(lang)] }),
                EditorView.updateListener.of(u => {
                    if (u.docChanged) onChange(u.state.doc.toString());
                    if (u.selectionSet || u.docChanged) {
                        const head = u.state.selection.main.head;
                        const line = u.state.doc.lineAt(head);
                        onCursor?.({ line: line.number, col: head - line.from + 1 });
                    }
                }),
                keymap.of([
                    indentWithTab,
                    { key: 'Mod-s',     run: () => (onSave?.(), true) },
                    { key: 'Mod-Enter', run: () => (onRun?.(),  true) }
                ]),
                EditorView.lineWrapping
            ]
        });

        api.set = (t, l = 'js') => {
            try { view.setState(makeState(t, l)); }
            catch (e) { console.warn('setState:', e); }
        };
        api.get = () => view.state.doc.toString();
        api.focus = () => view.focus();
        api.blur = () => view.contentDOM?.blur();

        api.insert = (text, offset = text.length) => {
            const from = view.state.selection.main.head;
            view.dispatch({
                changes: { from, insert: text },
                selection: { anchor: from + offset },
                scrollIntoView: true,
                userEvent: 'input.type'
            });
            view.focus();
        };
        api.newline = () => api.insert('\n');
        api.indent = () => api.insert('  ');
        api.backspace = () => {
            const sel = view.state.selection.main;
            if (sel.empty) {
                if (sel.head <= 0) { view.focus(); return; }
                view.dispatch({
                    changes: { from: sel.head - 1, to: sel.head },
                    scrollIntoView: true,
                    userEvent: 'delete.backward'
                });
            } else {
                view.dispatch({
                    changes: { from: sel.from, to: sel.to },
                    scrollIntoView: true,
                    userEvent: 'delete.backward'
                });
            }
            view.focus();
        };
        api.moveCursor = dir => {
            const head = view.state.selection.main.head;
            const next = Math.max(0, Math.min(view.state.doc.length, head + dir));
            view.dispatch({ selection: { anchor: next }, scrollIntoView: true });
            view.focus();
        };
        api.moveLine = dir => {
            const head = view.state.selection.main.head;
            const line = view.state.doc.lineAt(head);
            const target = line.number + dir;
            if (target < 1 || target > view.state.doc.lines) { view.focus(); return; }
            const tl = view.state.doc.line(target);
            const next = Math.min(tl.from + (head - line.from), tl.to);
            view.dispatch({ selection: { anchor: next }, scrollIntoView: true });
            view.focus();
        };
        api.revealCursor = () => {
            const pos = view.state.selection.main.head;
            view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: 8 }) });
        };
        api.view = view;
        api.refreshInput = () => {
            const c = view.contentDOM;
            if (customKb()) c.setAttribute('inputmode', 'none'); else c.removeAttribute('inputmode');
            try { view.dispatch({}); } catch {}
        };
    } catch (e) {
        console.warn('CodeMirror не загрузился, fallback на textarea:', e);
        ta = document.createElement('textarea');
        ta.spellcheck = false;
        ta.inputMode = customKb() ? 'none' : 'text';
        ta.setAttribute('autocapitalize', 'off');
        ta.setAttribute('autocorrect', 'off');
        ta.setAttribute('autocomplete', 'off');
        ta.setAttribute('enterkeyhint', 'enter');
        el.append(ta);
        ta.style.cssText = 'width:100%;height:100%;background:var(--bg-1);color:var(--fg-1);border:none;padding:12px;font-family:var(--font-mono);font-size:var(--fs);resize:none;outline:none;line-height:1.55;tab-size:2;';
        ta.oninput = () => onChange(ta.value);
        ta.onkeydown = e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = ta.selectionStart, en = ta.selectionEnd;
                ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
                ta.selectionStart = ta.selectionEnd = s + 2;
                onChange(ta.value);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's')     { e.preventDefault(); onSave?.(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun?.(); }
        };
        api.set = t => { ta.value = t; };
        api.get = () => ta.value;
        api.focus = () => ta.focus();
        api.blur = () => ta.blur();
        api.insert = (text, offset = text.length) => {
            const s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + text + ta.value.slice(en);
            const p = s + offset;
            ta.selectionStart = ta.selectionEnd = p;
            onChange(ta.value);
            ta.focus();
        };
        api.newline = () => api.insert('\n');
        api.indent = () => api.insert('  ');
        api.backspace = () => {
            const s = ta.selectionStart, en = ta.selectionEnd;
            if (s !== en) {
                ta.value = ta.value.slice(0, s) + ta.value.slice(en);
                ta.selectionStart = ta.selectionEnd = s;
            } else if (s > 0) {
                ta.value = ta.value.slice(0, s - 1) + ta.value.slice(s);
                ta.selectionStart = ta.selectionEnd = s - 1;
            }
            onChange(ta.value);
            ta.focus();
        };
        api.moveCursor = dir => {
            const p = Math.max(0, Math.min(ta.value.length, ta.selectionStart + dir));
            ta.selectionStart = ta.selectionEnd = p;
            ta.focus();
        };
        api.view = ta;
        api.refreshInput = () => { ta.inputMode = customKb() ? 'none' : 'text'; };
    }

    return api;
}

/* ================================================================
   Совместимость: модульные set/get/... делегируют активному api.
   keyboard.js импортирует именно их.
   ================================================================ */
let _primary = null;

export function init(el, handlers) {
    _primary = create(el, handlers);
    return _primary;
}
export const refreshInput = () => instances.forEach(a => a.refreshInput?.());
export function setActive(api) { if (api) _primary = api; }
export function getActive()     { return _primary; }

export const set          = (t, l) => _primary?.set(t, l);
export const get          = ()    => _primary?.get() ?? '';
export const focus        = ()    => _primary?.focus();
export const blur         = ()    => _primary?.blur();
export const insert       = (t, o) => _primary?.insert(t, o);
export const newline      = ()    => _primary?.newline();
export const indent       = ()    => _primary?.indent();
export const backspace    = ()    => _primary?.backspace();
export const moveCursor   = d     => _primary?.moveCursor(d);
export const moveLine     = d     => _primary?.moveLine(d);
export const revealCursor = ()    => _primary?.revealCursor();