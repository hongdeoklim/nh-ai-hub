const fs = require('fs');
let c = fs.readFileSync('src/components/layout/MainLayout.tsx', 'utf8');

c = c.replace(/aria-label=\{\s*promptPanel\.expanded\s*\?\s*'프롬프트 패널 접기'\s*:\s*'프롬프트 패널 펼치기'\s*\}/, 'aria-label={promptPanel.expanded ? \'프롬프트 보관함 닫기\' : \'프롬프트 보관함 열기\'}');

c = c.replace(/title=\{\s*promptPanel\.expanded\s*\?\s*'프롬프트 패널 접기'\s*:\s*'프롬프트 패널 펼치기'\s*\}/, 'title="프롬프트 보관함"');

c = c.replace(/\{\s*promptPanel\s*\?\s*\(\s*<button\s*type=\"button\"\s*title=\"프롬프트 보관함\"[\s\S]*?<span className=\"min-w-0 truncate text-left\">프롬프트 보관함<\/span>\s*\)\s*:\s*null\}\s*<\/button>\s*\)\s*:\s*null\}/, '');

fs.writeFileSync('src/components/layout/MainLayout.tsx', c, 'utf8');
