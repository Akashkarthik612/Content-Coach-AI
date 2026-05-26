import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { COPY } from './landingContent';

const fadeUp = (delay = 0) => ({
  initial:   { opacity: 0, y: 24 },
  animate:   { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: 'easeOut' },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white py-20 md:py-32">
      {/* Subtle blue radial at top-right */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #DBEAFE 0%, transparent 70%)' }}
      />

      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

        {/* Left: headline + copy + CTAs */}
        <div className="flex flex-col gap-6">
          <motion.h1
            {...fadeUp(0)}
            className="text-4xl sm:text-5xl font-bold text-[--color-text] leading-tight whitespace-pre-line"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {COPY.hero.headline}
          </motion.h1>

          <motion.p
            {...fadeUp(0.1)}
            className="text-base sm:text-lg text-[--color-text-muted] leading-relaxed max-w-lg"
          >
            {COPY.hero.subline}
          </motion.p>

          <motion.div
            {...fadeUp(0.2)}
            className="flex flex-wrap gap-3"
          >
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
            >
              {COPY.hero.ctaPrimary}
              <ArrowRight size={16} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 border border-[--color-border] hover:border-[--color-blue-primary] text-[--color-text] px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
            >
              {COPY.hero.ctaSecondary}
            </a>
          </motion.div>
        </div>

        {/* Right: version diff card */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md bg-white border border-[--color-border] rounded-xl shadow-md overflow-hidden">
            {/* v1 block */}
            <div className="p-4 border-b border-[--color-border]">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-[--color-bg-subtle] text-[--color-text-muted]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {COPY.hero.diffV1Label}
                </span>
              </div>
              <p
                className="text-sm text-[--color-text-muted] leading-relaxed line-through opacity-60"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {COPY.hero.diffV1Text}
              </p>
            </div>

            {/* Arrow separator */}
            <div className="flex items-center justify-center py-3 bg-[--color-bg-soft]">
              <div className="flex items-center gap-1">
                <div className="h-px w-8 bg-[--color-border]" />
                <ArrowRight size={14} className="text-[--color-blue-primary] animate-bounce" style={{ animationDirection: 'alternate' }} />
                <div className="h-px w-8 bg-[--color-border]" />
              </div>
            </div>

            {/* v2 block */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-[--color-blue-light] text-[--color-blue-dark]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {COPY.hero.diffV2Label}
                </span>
              </div>
              <p
                className="text-sm text-[--color-text] leading-relaxed"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {COPY.hero.diffV2Text}
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
