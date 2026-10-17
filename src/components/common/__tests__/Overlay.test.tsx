// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Overlay } from '../Overlay'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('Overlay', () => {
  it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
    render(
      <Overlay open={false} onClose={() => {}} variant="dialog" label="설정">
        <p>본문</p>
      </Overlay>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('본문')).toBeNull()
  })

  it('열리면 이름 있는 모달 다이얼로그로 렌더되고 배경 스크롤을 잠근다', () => {
    const { unmount } = render(
      <Overlay open onClose={() => {}} variant="sheet" label="계정">
        <p>본문</p>
      </Overlay>,
    )
    const dialog = screen.getByRole('dialog', { name: '계정' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('Escape 와 배경 클릭으로 닫힌다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <Overlay open onClose={onClose} variant="dialog" label="확인">
        <button type="button">안쪽 버튼</button>
      </Overlay>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)

    // 패널 안쪽 클릭은 닫지 않는다
    await user.click(screen.getByRole('button', { name: '안쪽 버튼' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('닫히면 열기 전에 포커스가 있던 요소로 포커스를 돌려준다', async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">열기</button>
          <Overlay open={open} onClose={() => {}} variant="drawer" label="메뉴">
            <p>메뉴 본문</p>
          </Overlay>
        </>
      )
    }
    const { rerender } = render(<Harness open={false} />)
    const opener = screen.getByRole('button', { name: '열기' })
    opener.focus()

    rerender(<Harness open />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '메뉴' }))

    rerender(<Harness open={false} />)
    expect(document.activeElement).toBe(opener)
  })

  it('뒤로가기(popstate)로 닫히고, backCloseable=false 면 history 를 건드리지 않는다', () => {
    const onClose = vi.fn()
    const before = window.history.length
    const { unmount } = render(
      <Overlay open onClose={onClose} variant="sheet" label="시트">
        <p>본문</p>
      </Overlay>,
    )
    expect(window.history.length).toBe(before + 1)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    const lengthNow = window.history.length
    render(
      <Overlay open onClose={() => {}} variant="dialog" label="다이얼로그" backCloseable={false}>
        <p>본문</p>
      </Overlay>,
    )
    expect(window.history.length).toBe(lengthNow)
  })
})
