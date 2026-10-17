import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 프런트엔드(src) 만 린트한다. Supabase Edge Function(Deno 런타임)·임시 스크립트·에이전트는
  // 별도 도구(deno lint 등)로 검사해야 하며, 브라우저 전역 기준의 이 설정으로는 오탐만 낸다.
  globalIgnores([
    'dist',
    'supabase/functions',
    'functions_v2',
    'scratch',
    'agent',
    'installer',
    'scripts',
    'utils',
    '*.cjs',
    '*.js',
    'check-*.ts',
    'cleanup-orphans.ts',
    'test-ingest.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // `_` 접두 변수/인자는 의도된 미사용으로 허용
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // React Compiler 지향 규칙 — 기존 코드의 effect 내 setState 는 점진적으로 정리한다 (경고로 가시화)
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
