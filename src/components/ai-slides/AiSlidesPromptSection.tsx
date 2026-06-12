import { forwardRef } from 'react'

import {
  type AiSlidesAspectRatio,
  type AiSlidesGuideMode,
  type AiSlidesImageEngine,
  type AiSlidesStyleMode,
  type AiSlidesTemplate,
} from '../../data/ai-slides-catalog'
import { ChatInput, type ChatSendPayload } from '../chat/ChatInput'
import { ModelSelectRow } from '../chat/ChatStartHub'
import type { ModelSelectVersionRow } from '../../types/ai-models'
import { AiSlidesPromptFiles } from './AiSlidesPromptFiles'
import { AiSlidesSettingsBar } from './AiSlidesSettingsBar'

export type AiSlidesPromptSectionProps = {
  styleMode: AiSlidesStyleMode
  onStyleModeChange: (mode: AiSlidesStyleMode) => void
  imageEngine: AiSlidesImageEngine
  onImageEngineChange: (engine: AiSlidesImageEngine) => void
  aspectRatio: AiSlidesAspectRatio
  onAspectRatioChange: (ratio: AiSlidesAspectRatio) => void
  guideMode: AiSlidesGuideMode
  onGuideModeChange: (mode: AiSlidesGuideMode) => void
  appliedTemplate: AiSlidesTemplate | null
  onClearAppliedTemplate: () => void
  draft: string
  onDraftChange: (value: string) => void
  onSend: (payload: ChatSendPayload) => void
  profileReady: boolean
  selectedModel: string
  versionRows: readonly ModelSelectVersionRow[]
  modelSaving: boolean
  onModelChange: (id: string) => void
  generating?: boolean
}

export const AiSlidesPromptSection = forwardRef<
  HTMLElement,
  AiSlidesPromptSectionProps
>(function AiSlidesPromptSection(
  {
    styleMode,
    onStyleModeChange,
    imageEngine,
    onImageEngineChange,
    aspectRatio,
    onAspectRatioChange,
    guideMode,
    onGuideModeChange,
    appliedTemplate,
    onClearAppliedTemplate,
    draft,
    onDraftChange,
    onSend,
    profileReady,
    selectedModel,
    versionRows,
    modelSaving,
    onModelChange,
    generating = false,
  },
  ref,
) {
  return (
    <section
      ref={ref}
      className="prompt-input-section has-promo-banner mb-6"
    >
      <div className="prompt-input-wrapper">
        <AiSlidesSettingsBar
          styleMode={styleMode}
          onStyleModeChange={onStyleModeChange}
          imageEngine={imageEngine}
          onImageEngineChange={onImageEngineChange}
          aspectRatio={aspectRatio}
          onAspectRatioChange={onAspectRatioChange}
          guideMode={guideMode}
          onGuideModeChange={onGuideModeChange}
        />

        <div className="search-input-wrapper input-wrapper mt-3 w-full overflow-visible rounded-[16px] border border-gray-200 bg-white shadow-[0px_6px_30px_0px_rgba(0,0,0,0.08)] dark:border-[#e6e9eb40] dark:bg-[#333333]">
          <div className="slides-template input relative cursor-text px-[12px] pb-[12px] pt-3">
            <ChatInput
              value={draft}
              onChange={onDraftChange}
              onSend={onSend}
              disabled={!profileReady}
              allowSend={Boolean(profileReady && appliedTemplate)}
              generating={generating}
              variant="gemini"
              disableAttachments
              embeddedInSlidesShell
              slidesMinimalComposer
              placeholder={
                appliedTemplate
                  ? `「${appliedTemplate.titleKo}」 주제·청중·핵심 메시지를 입력하세요.`
                  : '아래 템플릿에서 Apply를 눌러 선택하세요.'
              }
              aboveTextareaContent={
                appliedTemplate ? (
                  <AiSlidesPromptFiles
                    template={appliedTemplate}
                    guideMode={guideMode}
                    onRemove={onClearAppliedTemplate}
                  />
                ) : null
              }
            />
          </div>
        </div>

        {profileReady ? (
          <div className="mt-2 flex justify-end px-0.5">
            <ModelSelectRow
              selectedModel={selectedModel}
              modelVersionSelectId="ai-slides-model-version-select"
              versionRows={versionRows}
              modelSaving={modelSaving}
              profileReady={profileReady}
              onModelChange={onModelChange}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
})
