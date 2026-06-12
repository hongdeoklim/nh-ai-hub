import type { AiDesignerCategory, AiDesignerCategoryId } from '../../data/ai-designer-catalog'

type AiDesignerCategoryBarProps = {
  categories: AiDesignerCategory[]
  activeId: AiDesignerCategoryId
  onSelect: (id: AiDesignerCategoryId) => void
}

export function AiDesignerCategoryBar({
  categories,
  activeId,
  onSelect,
}: AiDesignerCategoryBarProps) {
  const designCategories = categories.filter((category) => category.id !== 'chat')

  return (
    <div className="ai-designer-category-bar w-full mt-10 mb-6">
      <div className="category-container box-border flex w-full justify-center px-0 md:px-10 xl:px-[116px]">
        <div
          className="category-grid flex w-full max-w-[2000px] flex-wrap justify-center gap-x-8 gap-y-3.5"
          aria-label="디자인 카테고리"
        >
          {designCategories.map((category) => {
            const active = category.id === activeId

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onSelect(category.id)}
                aria-pressed={active}
                aria-label={category.label}
                className={`category-card group relative block h-[118px] w-24 shrink-0 overflow-hidden rounded-lg bg-white/60 shadow-[0_3px_30px_rgba(0,0,0,0.06)] backdrop-blur-[25px] transition-all duration-300 hover:scale-110 dark:bg-white/10 ${
                  active ? 'scale-105 ring-2 ring-orange-500/70' : ''
                }`}
              >
                <div className="glow-background absolute inset-0 z-0">
                  <img
                    src={category.thumbnailUrl}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    decoding="async"
                    className="glow-image absolute left-1/2 top-[55%] h-12 w-12 -translate-x-1/2 -translate-y-[60%] object-cover opacity-30 blur-[20px] transition-all duration-300"
                  />
                </div>

                <div className="card-content relative z-[1] flex h-full flex-col items-center justify-between px-0 pb-3.5 pt-5">
                  <div className="image-container flex w-full flex-1 items-center justify-center">
                    <div className="image-wrapper relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[#f5f5f5] shadow-[0_0_15px_rgba(0,0,0,0.14)] transition-transform duration-300 group-hover:-rotate-6">
                      <img
                        src={category.thumbnailUrl}
                        alt={category.label}
                        loading="lazy"
                        decoding="async"
                        className="category-image h-full w-full rounded object-cover"
                      />
                    </div>
                  </div>

                  <span className="card-title mt-4 w-full truncate px-1 text-center text-[14px] font-bold leading-normal tracking-[-0.16px] text-[#232425] dark:text-white">
                    {category.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
