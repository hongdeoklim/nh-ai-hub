import type {
  AiDesignerCategory,
  AiDesignerCategoryId,
} from '../../data/ai-designer-catalog'

type AiDesignerGalleryProps = {
  categories: AiDesignerCategory[]
  activeId: AiDesignerCategoryId
  onSelect: (id: AiDesignerCategoryId) => void
}

export function AiDesignerGallery({
  categories,
  activeId,
  onSelect,
}: AiDesignerGalleryProps) {
  // 항상 전체 디자인 카테고리를 노출하고 선택된 것만 하이라이트한다
  // (예전엔 선택 시 카드 1개만 남아 빈 화면처럼 보였음).
  const filtered = categories.filter((c) => c.id !== 'chat')

  return (
    <div className="ai-designer-gallery px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px]! font-semibold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-300 md:text-[11px]!">
            NH-AX-HUB Designer
          </p>
          <h2 className="mt-1 text-[17px]! font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-[20px]!">
            {activeId === 'chat' ? '디자인 템플릿' : categories.find((c) => c.id === activeId)?.label}
          </h2>
        </div>
        <p className="hidden text-[11px]! text-stone-500 sm:block dark:text-stone-400 md:text-[12px]!">
          카드를 클릭하면 프롬프트가 입력됩니다
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`group overflow-hidden rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/5 ${
              activeId === category.id
                ? 'border-orange-500 ring-2 ring-orange-500/30'
                : 'border-stone-200/90 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600'
            }`}
          >
            <div
              className={`relative flex aspect-[4/5] flex-col justify-between bg-gradient-to-br p-4 ${category.gradient} dark:opacity-90`}
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110" aria-hidden>
                {category.emoji}
              </span>
              <div>
                <p className="text-[13px]! font-bold text-stone-900 md:text-[14px]!">{category.label}</p>
                {category.aspectRatio ? (
                  <p className="mt-0.5 text-[10px]! font-medium text-stone-700/80 md:text-[11px]!">{category.aspectRatio}</p>
                ) : null}
              </div>
            </div>
            <div className="bg-white px-3 py-2.5 dark:bg-stone-900">
              <p className="line-clamp-2 text-[11px]! leading-snug text-stone-500 dark:text-stone-400 md:text-[12px]!">
                {category.promptSeed}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
