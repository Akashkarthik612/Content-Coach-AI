import { Archive, GitBranch, Sparkles, BarChart2 } from 'lucide-react';
import { COPY } from './landingContent';

const ICON_MAP = { Archive, GitBranch, Sparkles, BarChart2 };

export default function Features() {
  return (
    <section id="features" className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2
            className="text-3xl sm:text-4xl font-semibold text-[--color-text] mb-3"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {COPY.features.headline}
          </h2>
          <p className="text-base text-[--color-text-muted]">{COPY.features.subline}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {COPY.features.items.map(({ title, body, icon, badge }) => {
            const Icon = ICON_MAP[icon];
            return (
              <div
                key={title}
                className="bg-white border border-[--color-border] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="bg-[--color-blue-light] p-2 rounded-lg">
                    <Icon size={20} className="text-[--color-blue-primary]" />
                  </div>
                  {badge && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[--color-bg-subtle] text-[--color-text-muted]">
                      {badge}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[--color-text] mb-1">{title}</h3>
                  <p className="text-sm text-[--color-text-muted] leading-relaxed">{body}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
