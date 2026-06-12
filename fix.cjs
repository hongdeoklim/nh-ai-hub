const fs = require('fs');
let c = fs.readFileSync('src/components/layout/MainLayout.tsx', 'utf8');

c = c.replace(/<div[^>]*className=\{`grid w-full divide-stone-300\/65 dark:divide-stone-700\/80 \$\{[^}]+\}`\}[^>]*>[\s\S]*?<Link\s+to="\/workflows"[\s\S]*?<\/button>\s*\)\}\s*<\/div>/, '');

c = c.replace(/(<IconGeminiNewChat className="h-6 w-6" \/>\s*<\/span>\s*\{showExpandedSidebarContent \? \(\s*<span className="min-w-0 truncate text-left">새 채팅<\/span>\s*\) : null\}\s*<\/button>)/, 
`$1\n            {promptPanel ? (
              <button
                type="button"
                title="프롬프트 보관함"
                aria-label="프롬프트 보관함"
                className={\`\${sidebarNewChatClass} mt-1 sticky top-[2.2rem] z-20 bg-[#F4F1EA] dark:bg-stone-900 \${
                  showExpandedSidebarContent
                    ? 'justify-start gap-3 pl-3 pr-2 text-sm font-normal leading-5 text-stone-800 dark:text-stone-100'
                    : 'justify-center px-0'
                }\`}
                onClick={() => {
                  if (!promptPanel.expanded) promptPanel.toggle()
                  setIsMobileMenuOpen(false)
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-stone-700 dark:text-stone-300"
                  aria-hidden="true"
                >
                  <IconPromptChevronsRight className="h-5 w-5" />
                </span>
                {showExpandedSidebarContent ? (
                  <span className="min-w-0 truncate text-left">프롬프트 보관함</span>
                ) : null}
              </button>
            ) : null}`);

fs.writeFileSync('src/components/layout/MainLayout.tsx', c, 'utf8');
