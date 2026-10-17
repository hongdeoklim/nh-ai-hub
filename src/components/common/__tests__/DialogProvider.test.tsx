// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { DialogProvider, useDialogs } from '../DialogProvider'

type Dialogs = ReturnType<typeof useDialogs>

/** 훅 반환값을 테스트 바깥으로 꺼내는 프로브 */
function renderWithDialogs(): { dialogs: () => Dialogs } {
  let captured: Dialogs | null = null
  function Probe() {
    captured = useDialogs()
    return null
  }
  render(
    <DialogProvider>
      <Probe />
    </DialogProvider>,
  )
  return {
    dialogs: () => {
      if (!captured) throw new Error('DialogProvider 가 렌더되지 않았습니다.')
      return captured
    },
  }
}

afterEach(() => cleanup())

describe('DialogProvider · useDialogs', () => {
  it('confirm: 확인 버튼을 누르면 true 로 끝난다', async () => {
    const user = userEvent.setup()
    const { dialogs } = renderWithDialogs()

    let pending!: Promise<boolean>
    act(() => {
      pending = dialogs().confirm({ title: '삭제할까요?', confirmLabel: '삭제', tone: 'danger' })
    })

    expect(await screen.findByRole('dialog', { name: '삭제할까요?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '삭제' }))

    await expect(pending).resolves.toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('confirm: 취소 버튼과 Escape 는 false 로 끝난다', async () => {
    const user = userEvent.setup()
    const { dialogs } = renderWithDialogs()

    let first!: Promise<boolean>
    act(() => {
      first = dialogs().confirm({ title: '나갈까요?' })
    })
    await user.click(await screen.findByRole('button', { name: '취소' }))
    await expect(first).resolves.toBe(false)

    let second!: Promise<boolean>
    act(() => {
      second = dialogs().confirm({ title: '다시 나갈까요?' })
    })
    await screen.findByRole('dialog', { name: '다시 나갈까요?' })
    await user.keyboard('{Escape}')
    await expect(second).resolves.toBe(false)
  })

  it('confirm: 열려 있는 동안 새 confirm 을 부르면 이전 요청은 false 로 정리된다', async () => {
    const { dialogs } = renderWithDialogs()

    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = dialogs().confirm({ title: '첫 번째' })
    })
    act(() => {
      second = dialogs().confirm({ title: '두 번째' })
    })

    await expect(first).resolves.toBe(false)
    expect(await screen.findByRole('dialog', { name: '두 번째' })).toBeTruthy()

    act(() => {
      screen.getByRole('button', { name: '확인' }).click()
    })
    await expect(second).resolves.toBe(true)
  })

  it('prompt: 입력값을 앞뒤 공백 없이 돌려주고, 빈 값이면 저장 버튼이 비활성이다', async () => {
    const user = userEvent.setup()
    const { dialogs } = renderWithDialogs()

    let pending!: Promise<string | null>
    act(() => {
      pending = dialogs().prompt({ title: '이름 바꾸기', label: '새 이름', defaultValue: '기존 이름' })
    })

    const input = await screen.findByLabelText('새 이름')
    expect((input as HTMLInputElement).value).toBe('기존 이름')

    await user.clear(input)
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true)

    await user.type(input, '  분기 보고서  ')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await expect(pending).resolves.toBe('분기 보고서')
  })

  it('prompt: 취소하면 null 로 끝나고, 다시 열면 기본값으로 초기화된다', async () => {
    const user = userEvent.setup()
    const { dialogs } = renderWithDialogs()

    let first!: Promise<string | null>
    act(() => {
      first = dialogs().prompt({ title: '이름 바꾸기', label: '이름', defaultValue: 'A' })
    })
    const input = await screen.findByLabelText('이름')
    await user.type(input, '-수정')
    await user.click(screen.getByRole('button', { name: '취소' }))
    await expect(first).resolves.toBeNull()

    act(() => {
      void dialogs().prompt({ title: '이름 바꾸기', label: '이름', defaultValue: 'A' })
    })
    expect(((await screen.findByLabelText('이름')) as HTMLInputElement).value).toBe('A')
  })

  it('Provider 밖에서 useDialogs 를 쓰면 오류를 던진다', () => {
    function Orphan() {
      useDialogs()
      return null
    }
    const original = console.error
    console.error = () => {}
    try {
      expect(() => render(<Orphan />)).toThrow(/DialogProvider/)
    } finally {
      console.error = original
    }
  })
})
