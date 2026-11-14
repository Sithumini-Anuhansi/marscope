import marscopeLogo from '../../assets/branding/marscope-logo.png'

interface BrandMarkProps {
  compact?: boolean
}

export function BrandMark({ compact = true }: BrandMarkProps) {
  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-lg border border-line bg-void">
        <img
          src={marscopeLogo}
          alt="MARSCOPE"
          className={
            compact
              ? 'block h-[4.75rem] w-full object-cover object-[center_58%]'
              : 'mx-auto block h-28 w-auto max-w-full object-contain object-center'
          }
        />
      </div>
      <p className="mt-2 font-mono text-[10px] tracking-[0.22em] text-gold">BY TEAM ANORA</p>
    </div>
  )
}
