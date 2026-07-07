-- Phase C: 브라우저 CAD 에디터가 DWG를 열 수 있도록, 로컬 에이전트에게 DWG↔DXF 변환을
-- 시키는 명령을 화이트리스트에 추가한다. 변환 결과(DXF 텍스트)는 작업 result 로 반환된다.
insert into allowed_programs (command_name, exe_path, arg_template, allowed_input_roots, risk_tier)
values
  (
    'dwg_to_dxf',
    'C:\Program Files\Autodesk\AutoCAD 2025\acad.exe',
    array['._DXFOUT', '{path}'],
    array['C:\NH-AI-HUB-workspace'],
    'safe'
  )
on conflict (command_name) do nothing;
