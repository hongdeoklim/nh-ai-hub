import { useCallback, useEffect, useRef, useState } from 'react'

import {
  deletePluginConnection,
  fetchConnectablePlugins,
  savePluginConnection,
  testPluginConnection,
  type ConnectablePlugin,
} from '../../services/integrations/plugin-connections'

const MODE_LABEL = {
  per_user: '사용자별 연결',
  workspace_install: '관리자 설치형',
  admin_shared: '관리자 공용',
  hybrid: '개인/공용 선택',
} as const

export function PluginConnectionsPanel() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [plugins, setPlugins] = useState<ConnectablePlugin[]>([])
  const [selected, setSelected] = useState<ConnectablePlugin | null>(null)
  const [credential, setCredential] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setPlugins(await fetchConnectablePlugins()) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '플러그인을 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const openConnect = (plugin: ConnectablePlugin) => {
    setSelected(plugin)
    setCredential('')
    dialogRef.current?.showModal()
  }

  const connect = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusyId(selected.id)
    try {
      await savePluginConnection(selected.id, credential)
      dialogRef.current?.close()
      await load()
    } catch (connectError) { setError(connectError instanceof Error ? connectError.message : '연결 저장에 실패했습니다.') }
    finally { setBusyId(null) }
  }

  const test = async (plugin: ConnectablePlugin) => {
    setBusyId(plugin.id)
    setError(null)
    try { await testPluginConnection(plugin.id); await load() }
    catch (testError) { setError(testError instanceof Error ? testError.message : '연결 테스트에 실패했습니다.'); await load() }
    finally { setBusyId(null) }
  }

  const disconnect = async (plugin: ConnectablePlugin) => {
    if (!window.confirm(`${plugin.name} 연결을 해제하시겠습니까?`)) return
    setBusyId(plugin.id)
    try { await deletePluginConnection(plugin.id); await load() }
    catch (disconnectError) { setError(disconnectError instanceof Error ? disconnectError.message : '연결 해제에 실패했습니다.') }
    finally { setBusyId(null) }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900" aria-labelledby="plugin-connections-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="plugin-connections-title" className="text-lg font-bold">MCP·플러그인 연결</h2><p className="mt-1 text-sm text-stone-500">관리자가 활성화한 도구를 연결하고 실제 endpoint 호출까지 테스트합니다.</p></div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-stone-300 px-3 py-2 font-semibold dark:border-stone-700">새로고침</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {loading ? <p className="py-8 text-center text-stone-500">플러그인 카탈로그 확인 중...</p> : plugins.length === 0 ? <p className="mt-4 rounded-lg bg-stone-50 p-4 text-stone-500 dark:bg-stone-950/50">현재 관리자가 활성화한 사용자 연결 플러그인이 없습니다.</p> : (
        <ul className="mt-5 grid gap-3 md:grid-cols-2" role="list">{plugins.map((plugin) => {
          const requiresCredential = plugin.auth_type !== 'none'
          const connected = !requiresCredential || Boolean(plugin.connection)
          return <li key={plugin.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{plugin.name}</h3><p className="mt-1 text-sm text-stone-500">{plugin.description || '설명 없음'}</p></div><span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs dark:bg-stone-800">{MODE_LABEL[plugin.connection_mode]}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-semibold ${plugin.connection?.status === 'connected' || !requiresCredential ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : plugin.connection?.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{!requiresCredential ? '인증 불필요' : plugin.connection?.status === 'connected' ? '연결 확인됨' : plugin.connection?.status === 'failed' ? '테스트 실패' : plugin.connection ? '테스트 필요' : '연결 필요'}</span>{plugin.connection?.credential_hint && <code>{plugin.connection.credential_hint}</code>}</div>
            {plugin.connection?.last_error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{plugin.connection.last_error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">{requiresCredential && !plugin.connection && <button type="button" onClick={() => openConnect(plugin)} className="rounded-lg bg-orange-800 px-3 py-2 font-semibold text-white">연결하기</button>}{connected && plugin.endpoint_url && <button type="button" disabled={busyId === plugin.id} onClick={() => void test(plugin)} className="rounded-lg border border-stone-300 px-3 py-2 font-semibold disabled:opacity-50 dark:border-stone-700">연결 테스트</button>}{plugin.connection && <button type="button" onClick={() => void disconnect(plugin)} className="rounded-lg px-3 py-2 font-semibold text-red-700 dark:text-red-300">연결 해제</button>}{plugin.setup_url && <a href={plugin.setup_url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">키 발급 ↗</a>}{plugin.docs_url && <a href={plugin.docs_url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">공식 문서 ↗</a>}</div>
          </li>
        })}</ul>
      )}
      <dialog ref={dialogRef} aria-labelledby="plugin-connect-title" className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-black/50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        {selected && <form onSubmit={connect} className="p-6"><h2 id="plugin-connect-title" className="text-xl font-semibold">{selected.name} 연결</h2><p className="mt-2 text-sm text-stone-500">키는 서버에서 AES-GCM으로 암호화되며 브라우저에 다시 표시되지 않습니다.</p><label htmlFor="plugin-credential" className="mt-5 block font-medium">{selected.auth_type === 'bearer' ? 'Access Token' : 'API Key'}<input id="plugin-credential" name="credential" type="password" required minLength={4} autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => dialogRef.current?.close()} className="rounded-lg px-4 py-2">취소</button><button type="submit" disabled={busyId === selected.id} className="rounded-lg bg-orange-800 px-4 py-2 font-semibold text-white disabled:opacity-50">암호화하여 저장</button></div></form>}
      </dialog>
    </section>
  )
}
