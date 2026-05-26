import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COPY } from './landingContent';

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">

        <div className="text-center max-w-xl mx-auto mb-12">
          <h2
            className="text-3xl sm:text-4xl font-semibold text-[--color-text] mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {COPY.pricing.headline}
          </h2>
          <p className="text-base text-[--color-text-muted]">{COPY.pricing.subline}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {COPY.pricing.tiers.map((tier) => (
            <div
              key={tier.name}
              className={[
                'rounded-xl p-8 flex flex-col gap-6',
                tier.highlight
                  ? 'border-2 border-[--color-blue-primary] shadow-md'
                  : 'border border-[--color-border] shadow-sm',
              ].join(' ')}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-[--color-text]">{tier.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-[--color-text]">{tier.price}</span>
                    <span className="text-sm text-[--color-text-muted]">{tier.period}</span>
                  </div>
                </div>
                {tier.badge && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[--color-blue-light] text-[--color-blue-dark]">
                    {tier.badge}
                  </span>
                )}
              </div>

              {/* Feature list */}
              <ul className="flex flex-col gap-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[--color-text]">
                    <Check size={15} className="text-[--color-blue-primary] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {tier.highlight ? (
                <button
                  className="mt-auto w-full bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
                  type="button"
                >
                  {tier.cta}
                </button>
              ) : (
                <Link
                  to="/register"
                  className="mt-auto block text-center border border-[--color-border] hover:border-[--color-blue-primary] text-[--color-text] px-5 py-3 rounded-lg text-sm font-medium transition-colors duration-150"
                >
                  {tier.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
