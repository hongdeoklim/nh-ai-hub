const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../src/index.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Force class-based dark mode for Tailwind v4
if (!css.includes('@custom-variant dark')) {
  css = css.replace('@import "tailwindcss";', '@import "tailwindcss";\n@custom-variant dark (&:where(.dark, .dark *));');
}

// 2. Change color-scheme
css = css.replace('color-scheme: light dark;', 'color-scheme: light;');

// 3. Append global Pretendard font rule
const fontRule = `\n\n/* Force Pretendard globally */\nbody, .app-shell, .admin-shell, .admin-sidebar, #root {\n  font-family: 'Pretendard', sans-serif !important;\n}\n`;
if (!css.includes('/* Force Pretendard globally */')) {
  css += fontRule;
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('CSS fixed successfully.');
