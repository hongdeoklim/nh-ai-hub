import { useState, type FormEvent } from 'react'

import { Navigate, useNavigate } from 'react-router-dom'



import { useAuth } from '../components/auth/useAuth'

import { supabase } from '../lib/supabase'

import { isPasskeySupported, loginWithPasskey } from '../lib/webauthn'



export function Login() {

 const navigate = useNavigate()

 const { session, loading } = useAuth()

 const [email, setEmail] = useState('')

 const [password, setPassword] = useState('')

 const [submitting, setSubmitting] = useState(false)

 const [passkeyBusy, setPasskeyBusy] = useState(false)

 const [errorMessage, setErrorMessage] = useState<string | null>(null)

 async function handlePasskeyLogin() {

 setErrorMessage(null)

 setPasskeyBusy(true)

 try {

 await loginWithPasskey()

 navigate('/', { replace: true })

    } catch (err) {

 const msg = err instanceof Error ? err.message : String(err)

 if (!/abort|cancel|NotAllowed/i.test(msg)) {

 setErrorMessage(`지문 로그인 실패: ${msg}`)

      }

    } finally {

 setPasskeyBusy(false)

    }

  }



 if (loading) {

 return (

      <div className="app-shell flex min-h-dvh items-center justify-center bg-surface-2">

        <p className="text-sm text-fg-muted">세션 확인 중…</p>

      </div>

    )

  }



 if (session) {

 return <Navigate to="/" replace />

  }



 async function handleSubmit(event: FormEvent) {

 event.preventDefault()

 setErrorMessage(null)

 setSubmitting(true)

 try {

 const { error } = await supabase.auth.signInWithPassword({

 email: email.trim(),

 password,

      })

 if (error) {

 setErrorMessage(error.message)

 return

      }

 navigate('/', { replace: true })

    } finally {

 setSubmitting(false)

    }

  }



 async function handleTempDevLogin() {

 const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL?.trim()

 const devPassword = import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? ''

 if (!devEmail || !devPassword) return



 setErrorMessage(null)

 setSubmitting(true)

 try {

 const { error } = await supabase.auth.signInWithPassword({

 email: devEmail,

 password: devPassword,

      })

 if (error) {

 setErrorMessage(error.message)

 return

      }

 navigate('/', { replace: true })

    } finally {

 setSubmitting(false)

    }

  }



 const showTempLogin =

 import.meta.env.DEV &&

 Boolean(import.meta.env.VITE_DEV_LOGIN_EMAIL?.trim()) &&

 Boolean(import.meta.env.VITE_DEV_LOGIN_PASSWORD)



 const handleGoogleLogin = async () => {

 const { error } = await supabase.auth.signInWithOAuth({

 provider: 'google',

 options: {

 redirectTo: window.location.origin,

      },

    })

 if (error) console.error('구글 로그인 에러:', error.message)

  }



 return (

    <div className="app-shell flex min-h-dvh flex-col bg-gradient-to-b from-brand-soft/90 via-bg to-surface-2">

      <header className="border-b border-border/80 bg-surface/80 px-4 py-4 backdrop-blur-md md:px-8">

        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 md:max-w-4xl">

          <div className="flex flex-col">

            <span className="text-xs font-semibold uppercase tracking-wider text-brand">

 NH Networks

            </span>

            <span className="text-lg font-bold tracking-tight text-fg md:text-xl">

 NH-AX-HUB

            </span>

          </div>

          <p className="hidden text-right text-xs text-fg-subtle sm:block sm:max-w-xs">

 농협네트웍스 임직원 전용 생성형 AI 포털

          </p>

        </div>

      </header>



      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:py-16">

        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-pop md:p-8">

          <h1 className="text-center text-xl font-bold text-fg">

 사내 계정 로그인

          </h1>



          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>

            <div>

              <label

 htmlFor="login-email"

 className="mb-1 block text-xs font-semibold text-fg-muted"

              >

 이메일

              </label>

              <input

 id="login-email"

 type="email"

 autoComplete="username"

 required

 value={email}

 onChange={(event) => setEmail(event.target.value)}

 className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg outline-none ring-focus/40 placeholder:text-fg-subtle focus:ring-2"

 placeholder="name@nhnetworks.co.kr"

              />

            </div>

            <div>

              <label

 htmlFor="login-password"

 className="mb-1 block text-xs font-semibold text-fg-muted"

              >

 비밀번호

              </label>

              <input

 id="login-password"

 type="password"

 autoComplete="current-password"

 required

 value={password}

 onChange={(event) => setPassword(event.target.value)}

 className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg outline-none ring-focus/40 focus:ring-2"

              />

            </div>



            {errorMessage ? (

              <p

 className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"

 role="alert"

              >

                {errorMessage}

              </p>

            ) : null}



            <button

 type="submit"

 disabled={submitting || loading}

 className="mt-2 flex w-full items-center justify-center rounded-xl bg-brand py-3 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"

            >

              {submitting ? '로그인 중…' : '로그인'}

            </button>



            <div className="relative my-2">

              <div className="absolute inset-0 flex items-center">

                <span className="w-full border-t border-border" />

              </div>

              <div className="relative flex justify-center text-xs">

                <span className="bg-surface px-2 text-fg-subtle">

 또는

                </span>

              </div>

            </div>



            <button

 type="button"

 onClick={handleGoogleLogin}

 className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-fg-muted shadow-sm transition-colors hover:bg-surface-2"

            >

              <svg

 className="h-5 w-5"

 viewBox="0 0 24 24"

 aria-hidden="true"

              >

                <path

 fill="#4285F4"

 d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"

                />

                <path

 fill="#34A853"

 d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"

                />

                <path

 fill="#FBBC05"

 d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"

                />

                <path

 fill="#EA4335"

 d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"

                />

              </svg>

 구글로 로그인하기

            </button>



            {isPasskeySupported() ? (

              <button

 type="button"

 onClick={() => void handlePasskeyLogin()}

 disabled={passkeyBusy || submitting}

 className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-fg-muted shadow-sm transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"

              >

                <span aria-hidden className="text-base">🔐</span>

                {passkeyBusy ? '인증 중…' : '지문·생체로 로그인'}

              </button>

            ) : null}



            {showTempLogin ? (

              <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-3">

                <p className="mb-2 text-[17px] leading-relaxed text-warning">

 로컬 개발 전용: `.env` 의{' '}

                  <span className="font-mono">VITE_DEV_LOGIN_*</span> 로 즉시 로그인합니다.

 값은 브라우저 번들에 포함되므로 배포·Git 에 넣지 마세요.

                </p>

                <button

 type="button"

 disabled={submitting || loading}

 onClick={() => void handleTempDevLogin()}

 className="flex w-full items-center justify-center rounded-xl border border-amber-600/40 bg-surface py-2.5 text-xs font-semibold text-warning hover:bg-warning-soft disabled:cursor-not-allowed disabled:opacity-60"

                >

 임시 로그인 (개발만)

                </button>

              </div>

            ) : null}

          </form>

        </div>

      </main>

    </div>

  )

}


