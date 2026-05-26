import { Link } from 'react-router-dom';
import { COPY } from './landingContent';

export default function FinalCTA() {
  return (
    <>
      {/* CTA section */}
      <section className="bg-[--color-blue-primary] py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6 text-center flex flex-col items-center gap-6">
          <h2
            className="text-3xl sm:text-4xl font-semibold text-white leading-tight max-w-2xl"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {COPY.cta.headline}
          </h2>
          <p className="text-base text-blue-100 max-w-lg">{COPY.cta.subline}</p>
          <Link
            to="/register"
            className="inline-block border-2 border-white text-white hover:bg-white hover:text-[--color-blue-primary] px-8 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
          >
            {COPY.cta.button}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[--color-text] py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span
              className="text-base font-bold text-white"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {COPY.footer.brand}
            </span>
            <span className="text-sm text-[--color-text-faint] hidden sm:inline">—</span>
            <span className="text-sm text-[--color-text-faint]">{COPY.footer.tagline}</span>
          </div>

          <div className="flex items-center gap-6">
            {COPY.footer.links.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-sm text-[--color-text-faint] hover:text-white transition-colors duration-150"
              >
                {label}
              </a>
            ))}
          </div>

          <p className="text-sm text-[--color-text-faint]">{COPY.footer.copyright}</p>
        </div>
      </footer>
    </>
  );
}
