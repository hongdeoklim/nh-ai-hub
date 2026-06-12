import { startTransition, useCallback, useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

function normalizeBlank(s: string): string | null {
  const t = s.trim()
  return t.length ? t : null
}

const inputCls =
  'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-orange-700/20 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100'

export function MyPagePanel() {
  const { profile, refreshProfile } = useAuth()
  const userId = profile?.id

  const [displayName, setDisplayName] = useState('')
  const [department, setDepartment] = useState('')
  const [jobRank, setJobRank] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    const saved = localStorage.getItem('nh_theme') as 'light' | 'dark' | null
    if (saved) {
      setTheme(saved)
    }
  }, [])

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme)
    if (newTheme === 'system') {
      localStorage.removeItem('nh_theme')
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', isDark)
    } else {
      localStorage.setItem('nh_theme', newTheme)
      document.documentElement.classList.toggle('dark', newTheme === 'dark')
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    queueMicrotask(() => {
      startTransition(() => {
        setDisplayName(profile.display_name ?? '')
        setDepartment(profile.department ?? '')
        setJobRank(profile.job_rank ?? '')
        setJobTitle(profile.job_title ?? '')
        setPhone(profile.phone ?? '')
        setProfileMsg(null)
      })
    })
  }, [profile])

  const handleSaveProfile = useCallback(async () => {
    if (!userId) {
      window.alert('로그인이 필요합니다.')
      return
    }
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: normalizeBlank(displayName),
          department: normalizeBlank(department),
          job_rank: normalizeBlank(jobRank),
          job_title: normalizeBlank(jobTitle),
          phone: normalizeBlank(phone),
        })
        .eq('id', userId)

      if (error) {
        setProfileMsg(error.message)
        return
      }
      await refreshProfile()
      setProfileMsg('프로필을 저장했습니다.')
    } finally {
      setProfileSaving(false)
    }
  }, [
    userId,
    displayName,
    department,
    jobRank,
    jobTitle,
    phone,
    refreshProfile,
  ])

  const handleChangePassword = useCallback(async () => {
    setPasswordSaving(true)
    setPasswordMsg(null)
    try {
      if (newPassword.length < 8) {
        setPasswordMsg('비밀번호는 8자 이상으로 설정해 주세요.')
        return
      }
      if (newPassword !== confirmPassword) {
        setPasswordMsg('새 비밀번호와 확인이 일치하지 않습니다.')
        return
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) {
        setPasswordMsg(error.message)
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg('비밀번호를 변경했습니다.')
    } finally {
      setPasswordSaving(false)
    }
  }, [newPassword, confirmPassword])

  if (!userId || !profile) {
    return (
      <p className="text-[20px] text-stone-600 dark:text-stone-400">
        로그인 후 마이페이지를 이용할 수 있습니다.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="font-semibold text-stone-900 dark:text-stone-100">
          내 정보
        </p>
        <p className="text-[20px] leading-relaxed text-stone-600 dark:text-stone-400">
          이름·소속 등은 AI 답변 맥락과 사이드바 표시에 활용할 수 있습니다. 로그인 이메일은
          보안상 여기서 변경하지 않습니다.
        </p>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          로그인 이메일 <span className="font-normal text-stone-500">(읽기 전용)</span>
          <input
            type="email"
            readOnly
            value={profile.email}
            className={`${inputCls} cursor-not-allowed bg-stone-100 dark:bg-stone-900`}
          />
        </label>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          화면 테마
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value as any)}
            className={inputCls}
          >
            <option value="system">시스템 기본값</option>
            <option value="light">라이트 모드</option>
            <option value="dark">다크 모드</option>
          </select>
        </label>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          이름
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={profileSaving}
            className={inputCls}
            placeholder="홍길동"
            autoComplete="name"
          />
        </label>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          소속
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={profileSaving}
            className={inputCls}
            placeholder="예: 디지털전략부"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
            직급
            <input
              value={jobRank}
              onChange={(e) => setJobRank(e.target.value)}
              disabled={profileSaving}
              className={inputCls}
              placeholder="예: 과장"
            />
          </label>
          <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
            직책
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              disabled={profileSaving}
              className={inputCls}
              placeholder="예: 팀장"
            />
          </label>
        </div>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          연락처
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={profileSaving}
            className={inputCls}
            placeholder="내선 또는 휴대전화"
            autoComplete="tel"
          />
        </label>

        {profileMsg ? (
          <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[20px] text-stone-700 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-300">
            {profileMsg}
          </p>
        ) : null}

        <button
          type="button"
          disabled={profileSaving}
          onClick={() => void handleSaveProfile()}
          className="rounded-full bg-orange-800 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-900 disabled:opacity-50"
        >
          {profileSaving ? '저장 중…' : '프로필 저장'}
        </button>
      </section>

      <section className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-700">
        <p className="font-semibold text-stone-900 dark:text-stone-100">
          비밀번호 변경
        </p>
        <p className="text-[20px] leading-relaxed text-stone-600 dark:text-stone-400">
          새 비밀번호는 8자 이상으로 입력하세요. 다른 기기에서도 다음 로그인부터 적용됩니다.
        </p>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          새 비밀번호
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={passwordSaving}
            className={inputCls}
            autoComplete="new-password"
          />
        </label>

        <label className="block text-[20px] font-medium text-stone-800 dark:text-stone-200">
          새 비밀번호 확인
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={passwordSaving}
            className={inputCls}
            autoComplete="new-password"
          />
        </label>

        {passwordMsg ? (
          <p className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[20px] text-stone-700 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-300">
            {passwordMsg}
          </p>
        ) : null}

        <button
          type="button"
          disabled={passwordSaving}
          onClick={() => void handleChangePassword()}
          className="rounded-full border border-stone-400 bg-white px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
        >
          {passwordSaving ? '처리 중…' : '비밀번호 변경'}
        </button>
      </section>
    </div>
  )
}
