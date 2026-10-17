// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { IconSettings } from '../../../common/icons'
import { CommandPalette, type PaletteAction } from '../CommandPalette'

function CurrentPath() {
  return <output aria-label="현재 경로">{useLocation().pathname}</output>
}

function renderPalette(actions: PaletteAction[] = [], onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <CommandPalette open onClose={onClose} actions={actions} />
      <Routes>
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  )
  return { onClose }
}

beforeAll(() => {
  // jsdom 은 레이아웃이 없어 scrollIntoView 를 구현하지 않는다
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => cleanup())

describe('CommandPalette', () => {
  it('검색어로 화면을 찾아 Enter 로 이동하고 팔레트를 닫는다', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette()

    const input = screen.getByRole('combobox', { name: '검색어 또는 명령 입력' })
    await user.type(input, '자료실')

    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('사내 자료실')
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('현재 경로').textContent).toBe('/reference-room')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('방향키로 선택을 옮기고 aria-activedescendant 가 따라간다', async () => {
    const user = userEvent.setup()
    renderPalette()

    const input = screen.getByRole('combobox')
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)

    await user.keyboard('{ArrowDown}')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id)

    await user.keyboard('{ArrowUp}{ArrowUp}')
    const last = options[options.length - 1]
    expect(last.getAttribute('aria-selected')).toBe('true')
  })

  it('작업은 키워드로도 찾을 수 있고, 클릭하면 실행 후 닫힌다', async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    const { onClose } = renderPalette([
      { id: 'theme', label: '테마 전환', icon: IconSettings, keywords: ['다크', 'dark'], run },
    ])

    await user.type(screen.getByRole('combobox'), 'dark')
    await user.click(screen.getByRole('option', { name: /테마 전환/ }))

    expect(run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('일치하는 항목이 없으면 안내 문구를 보여준다', async () => {
    const user = userEvent.setup()
    renderPalette()

    await user.type(screen.getByRole('combobox'), 'zzz-없는-화면')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('일치하는 항목이 없습니다.')).toBeTruthy()
  })
})
