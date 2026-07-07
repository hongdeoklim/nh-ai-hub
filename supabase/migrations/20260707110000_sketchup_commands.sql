-- SketchUp 실제 지원: 로컬 에이전트의 SketchUp 백엔드(sketchup_exec.py, Ruby API)가
-- 처리하는 명령을 화이트리스트에 추가한다. exe_path/arg_template 는 AutoCAD와 달리
-- 에이전트가 직접 쓰지 않지만(SketchUp은 -RubyStartup 로 구동), 게이트웨이·검증기
-- 스키마 일관성을 위해 채워둔다. 경로 인자는 작업 폴더 하위로 제한된다.
insert into allowed_programs (command_name, exe_path, arg_template, allowed_input_roots, risk_tier)
values
  (
    'open_skp',
    'C:\Program Files\SketchUp\SketchUp 2024\SketchUp.exe',
    array['-RubyStartup', '{startup}'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  ),
  (
    'export_skp',
    'C:\Program Files\SketchUp\SketchUp 2024\SketchUp.exe',
    array['-RubyStartup', '{startup}'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  ),
  (
    'run_ruby_sketchup',
    'C:\Program Files\SketchUp\SketchUp 2024\SketchUp.exe',
    array['-RubyStartup', '{startup}'],
    array['C:\NH-AI-HUB-workspace'],
    'destructive'
  )
on conflict (command_name) do nothing;

-- AI 플러그인 도구 설명을 AutoCAD + SketchUp 양쪽 명령을 아우르도록 갱신한다.
update public.plugins set
  name = 'CAD·SketchUp 원격 실행',
  description = '사용자 PC의 정품 AutoCAD/SketchUp을 화이트리스트 명령으로 원격 실행합니다(로컬 에이전트 설치 필요). arguments.command 에 명령을, 나머지 키에 인자를 넣으세요. '
    || 'AutoCAD: open_dwg(path), save_dwg, run_lisp(expr — 승인 필요). '
    || 'SketchUp: open_skp(path=.skp), export_skp(path=.skp, out=.png/.dae/.obj/.fbx 등 내보내기 경로), run_ruby_sketchup(expr — 승인 필요). '
    || '모든 경로는 C:\NH-AI-HUB-workspace 하위여야 합니다. 예: {"command":"export_skp","path":"C:\\NH-AI-HUB-workspace\\a.skp","out":"C:\\NH-AI-HUB-workspace\\a.png"}. '
    || '안전 명령은 즉시 큐잉되고, 파괴적 명령은 관리자 승인 대기로 등록됩니다.'
where plugin_id = 'nh.plugin.autocad';
