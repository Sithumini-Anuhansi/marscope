interface PagePlaceholderProps {
  title: string
  description: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section className="flex min-h-[60vh] flex-col justify-between rounded-2xl border border-line bg-panel/80 p-6 md:p-8">
      <div>
        <p className="mb-3 font-mono text-[11px] tracking-[0.28em] text-gold uppercase">
          Module reserved
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-sand md:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          {description}
        </p>
      </div>
      <div className="mt-10 border-t border-line pt-5 text-xs text-muted">
        This screen is a structural placeholder. Feature logic, datasets, and Cesium mapping will
        be added in later development stages.
      </div>
    </section>
  )
}
