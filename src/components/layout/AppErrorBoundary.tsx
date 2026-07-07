import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

/**
 * 최상위 렌더 오류 경계. 이게 없으면 어떤 컴포넌트든 렌더 중 throw 하면 앱 전체가
 * 빈 화면(white screen)으로 언마운트된다. 여기서 잡아 안내 화면 + 복구 버튼을 보여준다.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] 렌더 오류', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleHome = () => {
    window.location.href = '/'
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#FAF9F6] px-6 py-10 text-center dark:bg-stone-950">
        <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-3xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-3xl dark:bg-orange-950/50">
            ⚠️
          </div>
          <h1 className="text-[18px]! font-bold text-stone-900 dark:text-stone-50 md:text-[20px]!">
            예기치 못한 오류가 발생했습니다
          </h1>
          <p className="mt-2 text-[13px]! leading-relaxed text-stone-500 dark:text-stone-400 md:text-[14px]!">
            화면을 새로고침하면 대부분 해결됩니다. 문제가 계속되면 관리자에게 문의해 주세요.
          </p>

          {import.meta.env.DEV ? (
            <pre className="mt-4 max-h-48 w-full overflow-auto rounded-xl bg-stone-100 p-3 text-left text-[11px]! text-red-700 dark:bg-stone-950 dark:text-red-300">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          ) : null}

          <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-orange-800 px-5 py-2.5 text-[13px]! font-semibold text-white transition hover:bg-orange-900 dark:bg-orange-900 md:text-[14px]!"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-[13px]! font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800 md:text-[14px]!"
            >
              홈으로
            </button>
          </div>
        </div>
      </div>
    )
  }
}
