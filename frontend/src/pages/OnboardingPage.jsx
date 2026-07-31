import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding } from '../api/profile';

// ── Design tokens (Honne palette — matches the approved onboarding mock) ──────
const C = {
  bg:        '#F4F2EA',
  ink:       '#1B1C14',
  green:     '#14663B',
  greenHov:  '#0F4C2C',
  rust:      '#B0663A',
  sub:       '#9A9C8C',
  faint:     '#A6A895',
  muted:     '#6C7064',
  chipText:  '#3A3C30',
  chipBrd:   'rgba(27,28,20,.12)',
  track:     'rgba(27,28,20,.08)',
  divider:   'rgba(27,28,20,.05)',
  rowLbl:    '#A6A895',
  rowVal:    '#26281C',
};
const GEIST = "'Geist', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', monospace";

const QUESTIONS = [
  {
    key: 'profession', eyebrow: 'About you', title: 'What do you do?',
    sub: 'So we tailor tone, terminology, and examples to your world.',
    type: 'chips', multi: false,
    options: ['Founder / Owner', 'Marketer', 'Content Creator', 'Executive / Leader', 'Sales', 'Consultant', 'Engineer / Technical', 'Designer', 'Recruiter / HR', 'Student / Job-seeker'],
  },
  {
    key: 'industry', eyebrow: 'Your field', title: 'Which industry are you in?',
    sub: 'This powers industry-specific news, trends, and idea prompts.',
    type: 'chips', multi: false,
    options: ['SaaS / Tech', 'Finance', 'Healthcare', 'E-commerce / Retail', 'Marketing / Agency', 'Education', 'Real Estate', 'Media / Creative', 'Manufacturing', 'Nonprofit', 'Other'],
  },
  {
    key: 'role', eyebrow: 'Context', title: 'Describe your role in a sentence.',
    sub: 'Give the AI context beyond a job title — what you actually own.',
    type: 'text', placeholder: 'e.g. I lead growth at a B2B SaaS startup, focused on demand gen and founder-led content.',
    hint: 'Optional, but it makes every draft noticeably sharper.',
  },
  {
    key: 'audience', eyebrow: 'Who you reach', title: 'Who is your audience?',
    sub: 'The single most important field — who should each post speak to?',
    type: 'text', placeholder: 'e.g. Early-stage founders, heads of marketing, and B2B operators on LinkedIn.',
    hint: 'Roles, seniority, industry — whatever describes them best.',
  },
  {
    key: 'goals', eyebrow: 'Your goals', title: 'What are you here to achieve?',
    sub: 'We prioritize prompts and features around what matters to you.',
    type: 'chips', multi: true, hint: 'Pick all that apply.',
    options: ['Build authority', 'Grow my audience', 'Generate leads', 'Drive website traffic', 'Recruit / hire', 'Land a job', 'Support a launch', 'Have fun / experiment'],
  },
  {
    key: 'topics', eyebrow: 'What you post about', title: 'What topics interest you?',
    sub: 'These fuel idea generation and your news recommendations.',
    type: 'chips', multi: true, hint: 'Pick a few — you can change these anytime.',
    options: ['Leadership', 'Startups', 'Marketing', 'Product', 'AI & Tech', 'Sales', 'Career growth', 'Personal stories', 'Industry news', 'Productivity', 'Culture', 'Finance'],
  },
  {
    key: 'style', eyebrow: 'Your voice', title: 'How should your posts sound?',
    sub: 'Sets the default voice so your very first draft feels like you.',
    type: 'chips', multi: false,
    options: ['Professional', 'Conversational', 'Bold & punchy', 'Warm & personal', 'Analytical', 'Witty'],
  },
];

const SUMMARY_ROWS = [
  { key: 'profession', label: 'Profession' },
  { key: 'industry',   label: 'Industry' },
  { key: 'audience',   label: 'Audience' },
  { key: 'goals',      label: 'Goals' },
  { key: 'topics',     label: 'Topics' },
  { key: 'style',      label: 'Voice' },
];

function fmt(v) {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '';
  return v || '';
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0);
  const [done, setDone]       = useState(false);
  const [answers, setAnswers] = useState({});

  const total = QUESTIONS.length;
  const q = QUESTIONS[step];
  const isLast = step === total - 1;

  function toggleChip(key, val, multi) {
    setAnswers(a => {
      if (multi) {
        const arr = Array.isArray(a[key]) ? [...a[key]] : [];
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        return { ...a, [key]: arr };
      }
      return { ...a, [key]: a[key] === val ? undefined : val };
    });
  }

  function setText(key, val) {
    setAnswers(a => ({ ...a, [key]: val }));
  }

  function isAnswered(question) {
    const v = answers[question.key];
    if (question.type === 'text') return true;
    if (question.multi) return Array.isArray(v) && v.length > 0;
    return !!v;
  }

  function next() {
    if (step < total - 1) setStep(s => s + 1);
    else setDone(true);
  }
  function back() {
    if (step > 0) setStep(s => s - 1);
  }
  function skipAll() {
    setDone(true);
  }

  function finish() {
    try {
      const userId = localStorage.getItem('user_id');
      localStorage.setItem(userId ? `cc_onboarded_${userId}` : 'cc_onboarded', '1');
      if (userId) localStorage.setItem('onboarding_answers', JSON.stringify(answers));
    } catch { /* localStorage unavailable — non-fatal */ }

    // Fire-and-forget: profile grounds researcher_node's prompts, but a slow/failed
    // save shouldn't block the user from reaching chat.
    submitOnboarding({
      profession: answers.profession,
      industry: answers.industry,
      role: answers.role,
      target_audience: answers.audience,
      writing_style: answers.style,
      goals: answers.goals,
      topics: answers.topics,
    }).catch(err => console.error('Failed to save onboarding profile:', err));

    navigate('/chat');
  }

  const answered = isAnswered(q);
  const nextDisabled = q.type === 'chips' && !answered;
  const nextLabel = isLast ? 'Finish' : (q.type === 'text' && !answers[q.key] ? 'Skip this' : 'Continue');
  const summary = SUMMARY_ROWS.map(r => ({ label: r.label, value: fmt(answers[r.key]) })).filter(r => r.value);

  const chipBase = {
    cursor: 'pointer', fontFamily: GEIST, fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.005em',
    padding: '11px 18px', borderRadius: 999, transition: 'all .2s cubic-bezier(.22,1,.36,1)',
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, display: 'flex', flexDirection: 'column', fontFamily: GEIST }}>
      <style>{`
        @keyframes obRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* TOP BAR */}
      <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 34px' }}>
        <span style={{ fontFamily: GEIST, fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em', color: C.green }}>
          Honne
        </span>
        {!done && (
          <button
            onClick={skipAll}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: C.sub, fontWeight: 500, letterSpacing: '-0.005em', padding: '6px 4px' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.muted; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.sub; }}
          >
            Skip for now →
          </button>
        )}
      </header>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8px 24px 64px' }}>
        <div style={{ width: '100%', maxWidth: 620 }}>

          {!done && (
            <div style={{ paddingTop: 24 }}>

              {/* progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 34 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.faint, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Step {step + 1} of {total}
                </span>
                <div style={{ flex: 1, height: 3, background: C.track, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(((step + 1) / total) * 100)}%`, background: C.green, borderRadius: 999, transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} />
                </div>
              </div>

              <div key={`q${step}`} style={{ animation: 'obRise .5s cubic-bezier(.22,1,.36,1) both' }}>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.green, marginBottom: 14 }}>
                  {q.eyebrow}
                </div>
                <h1 style={{ fontFamily: GEIST, fontWeight: 400, fontSize: 38, lineHeight: 1.12, letterSpacing: '-0.02em', margin: '0 0 8px', color: C.ink }}>
                  {q.title}
                </h1>
                <p style={{ fontFamily: GEIST, fontSize: 18, color: C.sub, margin: '0 0 30px', fontWeight: 400, letterSpacing: '-0.01em' }}>
                  {q.sub}
                </p>

                {q.type === 'chips' && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {q.options.map(opt => {
                        const v = answers[q.key];
                        const on = q.multi ? (Array.isArray(v) && v.includes(opt)) : v === opt;
                        const style = on
                          ? { ...chipBase, background: C.green, color: C.bg, border: `1px solid ${C.green}`, boxShadow: '0 8px 20px -12px rgba(20,102,59,.8)' }
                          : { ...chipBase, background: '#fff', color: C.chipText, border: `1px solid ${C.chipBrd}` };
                        return (
                          <button key={opt} onClick={() => toggleChip(q.key, opt, q.multi)} style={style}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {q.multi && q.hint && (
                      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 14, fontWeight: 500 }}>{q.hint}</div>
                    )}
                  </>
                )}

                {q.type === 'text' && (
                  <>
                    <textarea
                      value={answers[q.key] || ''}
                      onChange={e => setText(q.key, e.target.value)}
                      placeholder={q.placeholder}
                      rows={4}
                      style={{
                        width: '100%', resize: 'none', background: '#fff', border: `1px solid ${C.chipBrd}`,
                        borderRadius: 14, padding: '16px 18px', fontSize: 16, lineHeight: 1.6, color: C.ink,
                        fontFamily: GEIST, boxShadow: '0 1px 2px rgba(27,28,20,.03)', boxSizing: 'border-box',
                      }}
                    />
                    {q.hint && <div style={{ fontSize: 12.5, color: C.faint, marginTop: 10, fontWeight: 500 }}>{q.hint}</div>}
                  </>
                )}
              </div>

              {/* NAV */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 40 }}>
                {step > 0 && (
                  <button
                    onClick={back}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: C.muted, fontWeight: 600, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.ink; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
                  >
                    ← Back
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button
                  onClick={next}
                  disabled={nextDisabled}
                  style={{
                    height: 48, padding: '0 28px', border: 'none', borderRadius: 13, fontSize: 14.5, fontWeight: 600,
                    letterSpacing: '-0.005em', transition: 'all .2s ease', display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: GEIST,
                    ...(nextDisabled
                      ? { background: C.track, color: '#B0B2A2', cursor: 'not-allowed' }
                      : { background: C.green, color: C.bg, cursor: 'pointer', boxShadow: '0 12px 30px -14px rgba(20,102,59,.7)' }),
                  }}
                >
                  {nextLabel}
                </button>
              </div>

            </div>
          )}

          {done && (
            <div style={{ textAlign: 'center', paddingTop: 60, animation: 'obRise .6s cubic-bezier(.22,1,.36,1) both' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: C.green, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 26px' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h1 style={{ fontFamily: GEIST, fontWeight: 400, fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '0 0 12px', color: C.ink }}>
                You're all set
              </h1>
              <p style={{ fontFamily: GEIST, fontSize: 20, color: C.sub, margin: '0 0 34px', fontWeight: 400, letterSpacing: '-0.01em' }}>
                Your workspace is tuned to your voice. Let's write something worth reading.
              </p>

              {summary.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid rgba(27,28,20,.08)', borderRadius: 18, padding: '8px 8px 4px', maxWidth: 440, margin: '0 auto 36px', textAlign: 'left', boxShadow: '0 30px 70px -50px rgba(20,60,30,.4)' }}>
                  {summary.map(s => (
                    <div key={s.label} style={{ display: 'flex', gap: 16, padding: '13px 16px', borderBottom: `1px solid ${C.divider}` }}>
                      <span style={{ flex: '0 0 130px', fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.rowLbl, paddingTop: 2 }}>
                        {s.label}
                      </span>
                      <span style={{ flex: 1, fontSize: 14, color: C.rowVal, fontWeight: 500, lineHeight: 1.5 }}>
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={finish}
                style={{ height: 50, padding: '0 34px', border: 'none', borderRadius: 14, background: C.green, color: C.bg, fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em', cursor: 'pointer', boxShadow: '0 12px 30px -14px rgba(20,102,59,.7)', fontFamily: GEIST }}
                onMouseEnter={e => { e.currentTarget.style.background = C.greenHov; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.green; }}
              >
                Start writing →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
