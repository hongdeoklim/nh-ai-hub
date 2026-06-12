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
  const filtered =
    activeId === 'chat'
      ? categories.filter((c) => c.id !== 'chat')
      : categories.filter((c) => c.id === activeId)

  return (
    <div className="ai-designer-gallery px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">
            NH-AX-HUB Designer
          </p>
          <h2 className="mt-0.5 text-[14px] font-semibold text-stone-900 dark:text-stone-50">
            {activeId === 'chat' ? '디자인 템플릿' : categories.find((c) => c.id === activeId)?.label}
          </h2>
        </div>
        <p className="hidden text-[14px] text-stone-500 sm:block dark:text-stone-400">
          카드를 클릭하면 프롬프트가 입력됩니다
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`group overflow-hidden rounded-2xl border text-left transition hover:shadow-md ${
              activeId === category.id
                ? 'border-orange-500 ring-2 ring-orange-500/30'
                : 'border-stone-200/90 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600'
            }`}
          >
            <div
              className={`flex aspect-[4/5] flex-col justify-between bg-gradient-to-br p-4 ${category.gradient} dark:opacity-90`}
            >
              <span className="text-3xl" aria-hidden>
                {category.emoji}
              </span>
              <div>
                <p className="text-[14px] font-semibold text-stone-900">{category.label}</p>
                {category.aspectRatio ? (
                  <p className="mt-0.5 text-[14px] text-stone-600">{category.aspectRatio}</p>
                ) : null}
              </div>
            </div>
            <div className="bg-white px-3 py-2 dark:bg-stone-900">
              <p className="line-clamp-2 text-[14px] leading-snug text-stone-500 dark:text-stone-400">
                {category.promptSeed}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
