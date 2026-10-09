// Checks WCAG contrast for every colour pair the UI relies on, in both themes.
// Reads the token blocks from src/styles.css. Run: npm run check:contrast
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function readBlock(marker) {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Token block not found: ${marker}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens = {};
  for (const match of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) tokens[match[1]] = match[2];
  return tokens;
}

const materials = readBlock('/* tokens:materials */');
const themes = {
  light: { ...materials, ...readBlock('/* tokens:light') },
  dark: { ...materials, ...readBlock('/* tokens:dark') },
};

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum, what it is]
const TEXT = 4.5;
const LARGE = 3;
const UI = 3;
const PAIRS = [
  ['text', 'bg', TEXT, 'body text'],
  ['text', 'surface', TEXT, 'card text'],
  ['text', 'raised', TEXT, 'button text'],
  ['text', 'sunken', TEXT, 'input text'],
  ['muted', 'bg', TEXT, 'secondary text'],
  ['muted', 'surface', TEXT, 'secondary text on cards'],
  ['muted', 'raised', TEXT, 'secondary text on buttons'],
  ['muted', 'sunken', TEXT, 'lane labels / hints in fields'],
  ['accent', 'bg', TEXT, 'links, active nav'],
  ['accent', 'surface', TEXT, 'accent text on cards'],
  ['on-accent', 'accent', TEXT, 'primary button text'],
  ['hit', 'surface', LARGE, '"Correct" feedback (large, bold)'],
  ['close', 'surface', LARGE, '"Close" feedback (large, bold)'],
  ['miss', 'surface', LARGE, '"Missed" feedback (large, bold)'],
  ['hit', 'sunken', UI, 'hit note block on the highway'],
  ['miss', 'sunken', UI, 'missed note outline on the highway'],
  ['text', 'sunken', UI, 'upcoming note outline on the highway'],
  ['accent', 'sunken', UI, 'current note and hit line on the highway'],
  ['on-hit', 'hit', LARGE, 'label on a hit note block'],
  ['border-strong', 'surface', UI, 'input and button borders on cards'],
  ['border-strong', 'bg', UI, 'input and button borders on the page'],
  ['focus', 'bg', UI, 'focus ring'],
  ['focus', 'surface', UI, 'focus ring on cards'],
  ['bone', 'rosewood', UI, 'finger dot outline on the fretboard (the fill is the accent)'],
  ['on-accent', 'accent', LARGE, 'finger number in the dot'],
  ['bone', 'rosewood', UI, 'next-note ring / nut on the fretboard'],
  ['nickel', 'rosewood', UI, 'frets'],
  ['steel', 'rosewood', UI, 'plain strings'],
  ['bronze', 'rosewood', UI, 'wound strings'],
  ['ink', 'ivory', TEXT, 'key names on white keys'],
  ['accent', 'ivory', UI, 'active white key'],
  ['accent', 'ebony', UI, 'active black key'],
  ['ink', 'ivory', UI, 'next-key outline'],
  ['bone', 'ebony', UI, 'next-key outline on a black key; left-hand hatching on a black key'],
  ['ink', 'ivory', UI, 'left-hand hatching and outline on a white key'],
  ['ivory', 'ink', TEXT, 'left-hand badge ("L5") on its ink disc'],
  ['bone', 'ebony', TEXT, 'left-hand badge on a black key'],
  ['surface', 'text', TEXT, 'key name on the current left-hand note on the highway'],
];

let failures = 0;
for (const [theme, tokens] of Object.entries(themes)) {
  console.log(`\n${theme}`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  ?    ${fg} on ${bg}: missing token`);
      failures += 1;
      continue;
    }
    const ratio = contrast(tokens[fg], tokens[bg]);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'} ${ratio.toFixed(2).padStart(5)} >= ${min}  ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]}  (${what})`);
  }
}
console.log(failures ? `\n${failures} failing pair(s)` : '\nAll pairs pass.');
process.exitCode = failures ? 1 : 0;

// Colours must live only in the token blocks: flag hex/rgb/hsl values, gradients and
// backdrop filters anywhere else in the stylesheet or the scripts.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STRAY = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|gradient\(|backdrop-filter|color-mix\(/;
const tokenBlocks = /\/\* tokens:[\s\S]*?\n\}/g;
const strays = [];
css.replace(tokenBlocks, (block) => '\n'.repeat(block.split('\n').length - 1)).split('\n').forEach((line, i) => {
  if (!line.trim().startsWith('/*') && !line.trim().startsWith('*') && STRAY.test(line)) strays.push(`src/styles.css:${i + 1}: ${line.trim()}`);
});
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (STRAY.test(line) && !line.trim().startsWith('//')) strays.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
  }
}
const { readFileSync } = fs;
walk(new URL('../src', import.meta.url).pathname);
if (strays.length) {
  console.log(`\n${strays.length} colour value(s) outside the token blocks:`);
  strays.forEach((line) => console.log(`  ${line}`));
  process.exitCode = 1;
} else {
  console.log('No colour values outside the token blocks.');
}
