import { FolderOpen, RotateCcw, SearchX } from 'lucide-react';
import { COPY } from './landingContent';

const ICON_MAP = { FolderOpen, RotateCcw, SearchX };

export default function ProblemStrip() {
  return (
    <section className="bg-[--color-bg-subtle] py-16 md:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {COPY.problem.items.map(({ title, body, icon }) => {
            const Icon = ICON_MAP[icon];
            return (
              <div key={title} className="flex flex-col items-start gap-3">
                <div className="bg-[--color-blue-light] p-2.5 rounded-lg">
                  <Icon size={20} className="text-[--color-blue-primary]" />
                </div>
                <h3 className="text-base font-semibold text-[--color-text]">{title}</h3>
                <p className="text-sm text-[--color-text-muted] leading-relaxed">{body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
