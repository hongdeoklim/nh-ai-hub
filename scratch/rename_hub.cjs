const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
const exts = ['.ts', '.tsx', '.html', '.css'];

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walk(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const replacements = [
  { from: /NH AI Inside Hub/g, to: 'NH-AX-HUB' },
  { from: /NH AI Hub/g, to: 'NH-AX-HUB' },
  { from: /NH-AI-HUB/g, to: 'NH-AX-HUB' },
  { from: /NH AI Designer/g, to: 'NH-AX-HUB Designer' },
  { from: /NH AI Office/g, to: 'NH-AX-HUB Office' },
  { from: /NH AI Master Sheet/g, to: 'NH-AX-HUB Master Sheet' },
  { from: /NH AI 시스템/g, to: 'NH-AX-HUB 시스템' },
  { from: /NH AI/g, to: 'NH-AX-HUB' }
];

let changedFiles = 0;

walk(srcDir, (filePath) => {
  if (exts.some(ext => filePath.endsWith(ext))) {
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    
    // Process in order (longest match first)
    replacements.forEach(r => {
      newContent = newContent.replace(r.from, r.to);
    });

    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated: ${filePath}`);
      changedFiles++;
    }
  }
});

// Also check index.html in root
const indexHtml = path.join(__dirname, '../index.html');
if (fs.existsSync(indexHtml)) {
    let content = fs.readFileSync(indexHtml, 'utf8');
    let newContent = content;
    replacements.forEach(r => {
      newContent = newContent.replace(r.from, r.to);
    });
    if (newContent !== content) {
      fs.writeFileSync(indexHtml, newContent, 'utf8');
      console.log(`Updated: ${indexHtml}`);
      changedFiles++;
    }
}

console.log(`Done. Changed ${changedFiles} files.`);
