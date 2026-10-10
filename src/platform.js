/* ================================================================
   platform.js — единая детекция устройства для всего приложения.
   Раньше каждый модуль проверял ширину по-своему, из-за чего на
   планшетах (iPad landscape и т.п.) экранная клавиатура не появлялась.
   ================================================================ */

const mq = q => typeof matchMedia !== 'undefined' && matchMedia(q).matches;

/** Узкий экран (телефон или телефон в landscape). */
export const isMobile = () => mq('(max-width: 899px), (max-height: 500px)');

/** Основной способ ввода — палец (телефон/планшет), а не мышь. */
export const isCoarse = () => mq('(pointer: coarse)');

/** Устройство вообще умеет касания (включая ноутбуки с тачскрином). */
export const isTouch = () => isCoarse() || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/** Телефон в landscape — «короткий» экран, нужна split-клавиатура. */
export const isLandscape = () => mq('(orientation: landscape) and (max-height: 500px)');

/** Нужна ли экранная клавиатура: не отключена в настройках и это телефон/планшет. */
export const shouldKb = () => localStorage.getItem('ext-kb') !== '1' && (isMobile() || isCoarse());
