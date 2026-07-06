/** UniverWorkspace.jsx 타입 선언 — 런타임 구현은 같은 이름의 .jsx 파일 */
import type {
  UniverAiDataSignal,
  UniverOfficeActiveTab,
} from '../../services/ai/invoke-chat'

export type UniverWorkspaceProps = {
  aiDataSignal?: UniverAiDataSignal | null
  activeTab?: UniverOfficeActiveTab
  onActiveTabChange?: (tab: UniverOfficeActiveTab) => void
  className?: string
}

export default function UniverWorkspace(
  props: UniverWorkspaceProps,
): import('react').JSX.Element
