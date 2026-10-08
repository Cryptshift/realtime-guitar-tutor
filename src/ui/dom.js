// Tiny DOM helpers: element builder, text diffing and focus management.
import { icon } from './icons.js';

// h('button', { class: 'btn', onclick }, 'Label', childNode, ...). `null`/`false` children
// are skipped; arrays are flattened. Attributes starting with "on" become listeners;
// `dataset`, `style` (object) and boolean attributes are handled.
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key === 'html') {
      element.innerHTML = value;
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  append(element, children);
  return element;
}

function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Icon element (aria-hidden). Pair it with visible text or an aria-label on the control.
export function iconEl(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = icon(name);
  return span;
}

export function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

export function setAttr(element, name, value) {
  if (!element) return;
  const text = value === null || value === undefined ? null : String(value);
  if (text === null) element.removeAttribute(name);
  else if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}

export function clear(element) {
  element.replaceChildren();
}

// True when a key event comes from a text field, where shortcuts must not fire.
export function isTypingTarget(target) {
  const tag = target?.tagName;
  return Boolean(target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
