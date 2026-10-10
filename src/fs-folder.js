/* ================================================================
   fs-folder.js — автосохранение проекта в локальную папку на диске
   через File System Access API (Chrome / Edge).

   Работает поверх обычного IndexedDB-сохранения: пользователь один раз
   выбирает папку, после чего каждое изменение проекта (через fs.save)
   дебаунсится и пишется в файлы этой папки.
   ================================================================ */

import * as fs from './fs.js';

let dirHandle = null;
let dirty = false;
let timer = null;
let syncCb = null;   /* вызывается после завершения синхронизации */

export const isSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const isConnected = () => !!dirHandle;
export const currentName = () => dirHandle?.name ?? '';
export const onSync = cb => { syncCb = cb; };

const parts = p => p.split('/').filter(Boolean);

const getDir = async (segments, create = true) => {
    let d = dirHandle;
    for (const seg of segments) d = await d.getDirectoryHandle(seg, { create });
    return d;
};

export async function connect() {
    if (!isSupported()) throw Error('браузер не поддерживает выбор папки — нужен Chrome/Edge');
    const h = await window.showDirectoryPicker({ id: 'webide-project', mode: 'readwrite' });
    dirHandle = h;
    try { await syncNow(); } catch (e) { dirHandle = null; throw e; }
    return dirHandle.name;
}

export function disconnect() {
    dirHandle = null;
    clearTimeout(timer);
    dirty = false;
}

/* Полная выгрузка всех файлов проекта в папку. */
export async function syncNow() {
    if (!dirHandle) return;
    for (const [path, content] of Object.entries(fs.state.files)) {
        const segs = parts(path);
        const name = segs.pop();
        if (!name) continue;
        const dir = await getDir(segs, true);
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
    }
    dirty = false;
    syncCb?.();
}

const schedule = () => {
    if (!dirHandle) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(err => console.warn('folder sync:', err)), 500);
};

/* Подключаемся к событиям изменения проекта. */
let hooked = false;
export function init() {
    if (hooked) return;
    hooked = true;
    fs.onChange(schedule);
}

export const isDirty = () => dirty;
