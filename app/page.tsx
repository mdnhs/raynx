import { HeroScene } from "@/components/hero-scene"
import { WaitlistForm } from "@/components/site/waitlist-form"

// Pre-launch holding page for the main domain, shown until the full website
// goes live. Header, hero and investor strip share one viewport.
export default function Page() {
  return (
    <div className="hero-background flex min-h-svh flex-col overflow-clip text-white antialiased selection:bg-ice selection:text-abyss">
      <Header />
      <Hero />
      <Investors />
    </div>
  )
}

function Container({
  className = "",
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-14 ${className}`}
    >
      {children}
    </div>
  )
}

function Header() {
  return (
    <header className="relative z-50 py-4 sm:py-5 lg:py-6">
      <Container className="flex items-center justify-between gap-6">
        <a
          href="#"
          className="font-display text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ice"
        >
          raynx
        </a>
        <p className="flex items-center gap-2.5 rounded-full border border-white/10 bg-ink/50 px-3 py-1.5 text-xs text-mist backdrop-blur-md sm:px-3.5 sm:text-sm">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ice/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-ice" />
          </span>
          <span className="sm:hidden">Launching soon</span>
          <span className="hidden sm:inline">New website launching soon</span>
        </p>
      </Container>
    </header>
  )
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative flex flex-1 items-center"
    >
      <Container className="grid grid-cols-1 items-center gap-3 py-2 sm:gap-4 sm:py-3 lg:grid-cols-12 lg:gap-8 lg:py-6">
        <div className="relative z-20 lg:col-span-6">
          <h1
            id="hero-title"
            className="font-display max-w-[15ch] text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[3.6rem] xl:text-[4.25rem]"
          >
            We build software and grow it online
          </h1>
          <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-mist sm:mt-6 sm:text-lg">
            Raynx builds custom software and websites, then helps them get found
            and grow with SEO and digital marketing. Our full website is on the
            way. Leave your email and we&apos;ll tell you when it&apos;s live.
          </p>
          <WaitlistForm className="mt-8 sm:mt-9" />
        </div>

        <div className="relative order-first h-60 w-full sm:h-80 md:h-96 lg:order-none lg:col-span-6 lg:h-[min(600px,64svh)]">
          <div className="pointer-events-none absolute -top-12 -right-10 size-96 rounded-full bg-cyan-500/15 blur-[110px]" />
          <div className="pointer-events-none absolute top-1/3 right-1/4 size-80 rounded-full bg-blue-600/25 blur-[90px]" />
          <HeroScene className="relative" />
        </div>
      </Container>
    </section>
  )
}

function Investors() {
  return (
    <section
      aria-label="Investors"
      className="relative z-20 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <Container className="flex flex-col gap-4 border-t border-white/8 pt-5 lg:flex-row lg:items-center lg:gap-14">
        <p className="shrink-0 text-sm text-mist">Backed by</p>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-4 text-slate-300 sm:gap-x-12">
          <li className="flex flex-col leading-none font-medium tracking-[0.24em]">
            <span className="text-[11px] font-semibold">FINTECH</span>
            <span className="mt-1 text-[9px] font-light tracking-[0.3em]">
              COLLECTIVE
            </span>
          </li>
          <li className="flex items-end gap-1">
            <span className="text-base font-bold tracking-tight text-white">
              Stand<span className="font-extrabold text-slate-300">Up</span>
            </span>
            <span className="pb-0.5 text-[6.5px] leading-none font-bold tracking-widest text-slate-400">
              VENTURES
            </span>
          </li>
          <li className="flex items-center gap-2 text-xs">
            <span className="text-sm font-bold tracking-tighter text-cyan-400">
              {"//"}
            </span>
            <span className="text-[11px] font-bold tracking-[0.16em] text-slate-200">
              WATERTOWER
            </span>
            <span className="text-[10px] tracking-[0.16em] text-slate-400">
              VENTURES
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <svg
              className="size-3.5 fill-current text-white"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2L1 21h4.6l6.4-11.2L18.4 21H23L12 2z" />
            </svg>
            <span className="text-xs font-bold tracking-[0.2em] text-white">
              ANTLER
            </span>
          </li>
        </ul>
        <p className="shrink-0 text-sm text-mist lg:ml-auto">Dublin, Ireland</p>
      </Container>
    </section>
  )
}
