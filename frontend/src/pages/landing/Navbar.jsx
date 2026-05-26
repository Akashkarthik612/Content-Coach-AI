import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { COPY } from './landingContent';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-[--color-border]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <a
          href="#"
          className="text-xl font-bold text-[--color-blue-primary] tracking-tight"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {COPY.brand}
        </a>

        {/* Center — desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {COPY.nav.links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-sm text-[--color-text-muted] hover:text-[--color-text] transition-colors duration-150"
            >
              {label}
            </a>
          ))}
        </div>

        {/* Right — auth buttons (desktop) */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-[--color-text-muted] hover:text-[--color-text] hover:bg-[--color-bg-subtle] px-4 py-2 rounded-lg transition-colors duration-150"
          >
            {COPY.nav.login}
          </Link>
          <Link
            to="/register"
            className="bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150"
          >
            {COPY.nav.cta}
          </Link>
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="md:hidden text-[--color-text-muted] hover:text-[--color-text] p-2 rounded-lg transition-colors duration-150"
          onClick={() => setOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-[--color-border] bg-white/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3">
          {COPY.nav.links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="text-sm text-[--color-text-muted] hover:text-[--color-text] py-2 transition-colors duration-150"
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-[--color-border]">
            <Link
              to="/login"
              className="text-sm text-[--color-text-muted] hover:text-[--color-text] hover:bg-[--color-bg-subtle] px-4 py-2.5 rounded-lg transition-colors duration-150 text-center"
              onClick={() => setOpen(false)}
            >
              {COPY.nav.login}
            </Link>
            <Link
              to="/register"
              className="bg-[--color-blue-primary] hover:bg-[--color-blue-dark] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 text-center"
              onClick={() => setOpen(false)}
            >
              {COPY.nav.cta}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
