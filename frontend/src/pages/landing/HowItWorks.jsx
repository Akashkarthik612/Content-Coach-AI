import { COPY } from './landingContent';

export default function HowItWorks() {
  const { steps } = COPY.howItWorks;

  return (
    <section className="bg-[--color-bg-soft] py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">

        <h2
          className="text-3xl sm:text-4xl font-semibold text-[--color-text] text-center mb-16"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {COPY.howItWorks.headline}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {steps.map(({ number, title, body }, i) => (
            <div key={number} className="relative flex flex-col items-center text-center px-6">

              {/* Dotted connector line (not on last item) */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[calc(50%+2rem)] right-0 h-px border-t-2 border-dashed border-[--color-border]" />
              )}

              {/* Step number bubble */}
              <div
                className="relative z-10 w-16 h-16 rounded-full bg-[--color-blue-light] flex items-center justify-center mb-5"
              >
                <span
                  className="text-lg font-bold text-[--color-blue-primary]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {number}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-[--color-text] mb-2">{title}</h3>
              <p className="text-sm text-[--color-text-muted] leading-relaxed max-w-xs">{body}</p>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
