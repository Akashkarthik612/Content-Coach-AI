// Isometric "four team buildings, one knowledge layer" scene from the Claude Design
// landing (Honne Landing v2). Imperative SVG on purpose: dozens of packets move every
// frame, which would be wasteful as React state. Returns a stop function.

const NS = 'http://www.w3.org/2000/svg'
const S = 0.55
const OX = 380
const OY = 112
const VW = 760
const AV = ['#15181A', '#2C6E7F', '#C2553A']

const BUILDINGS = [
  { name: 'SALES', x0: 30, y0: 30, x1: 200, y1: 200, h: 118, roof: '#F6A15B', wl: '#EFE7DC', wr: '#D8CEC0', agent: 'RenewalPrep', ppl: [[218, 95, 'MR'], [218, 40, 'JT'], [110, 218, 'SK']] },
  { name: 'MARKETING', x0: 400, y0: 30, x1: 570, y1: 200, h: 92, roof: '#7FB8C4', wl: '#E8EEEF', wr: '#CBD8DB', agent: 'LaunchKit', ppl: [[470, 218, 'LB'], [540, 218, 'NB'], [588, 110, 'AV']] },
  { name: 'ENGINEERING', x0: 30, y0: 400, x1: 200, y1: 570, h: 140, roof: '#E9C99B', wl: '#F1EADF', wr: '#DCD0BE', agent: 'Changelog', ppl: [[218, 470, 'PS'], [110, 588, 'DK'], [218, 540, 'WE']] },
  { name: 'SUPPORT', x0: 420, y0: 420, x1: 580, y1: 580, h: 70, roof: '#E98A6B', wl: '#F3E6E0', wr: '#DDC6BC', agent: 'ReplyDraft', ppl: [[598, 480, 'OK'], [480, 598, 'SF'], [598, 550, 'RY']] },
]

const AGENT_TAG = (name) => '<b style="font-weight:500;font-family:Geist Mono, monospace;color:#C4501E">@' + name + '</b>'
const SCENARIOS = [
  { b: 0, p: 0, to: 3, name: 'Maya Rao', role: 'Account exec', msg: '@RenewalPrep brief me on Acme before Thursday', rep: 'Pulled the QBR deck from Honne IQ and asked ' + AGENT_TAG('ReplyDraft') + ' for open tickets.' },
  { b: 2, p: 0, to: 1, name: 'Priya Shah', role: 'Engineering manager', msg: '@Changelog what shipped this sprint?', rep: '12 PRs summarised, shared with ' + AGENT_TAG('LaunchKit') + ' for the release post.' },
  { b: 1, p: 0, to: 2, name: 'Leo Brandt', role: 'Brand lead', msg: '@LaunchKit plan the v2.5 launch', rep: 'Got release notes from ' + AGENT_TAG('Changelog') + '. 3 posts and an email drafted.' },
  { b: 3, p: 0, to: 0, name: 'Omar Khan', role: 'Support lead', msg: '@ReplyDraft answer ticket #4821', rep: 'Cited Refund policy v3 and flagged it to ' + AGENT_TAG('RenewalPrep') + '.' },
]

const P = (x, y, z = 0) => [OX + (x - y) * 0.866 * S, OY + (x + y) * 0.5 * S - z * S]
const f = (n) => n.toFixed(1)
const pts = (a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')
const poly = (a, fill, extra = '') => '<polygon points="' + pts(a) + '" fill="' + fill + '" ' + extra + '/>'

export function mountHeroScene(host) {
  const wins = []
  const building = (b, bi) => {
    const { x0, y0, x1, y1, h: hh } = b
    let o = '<g>'
    o += poly([P(x0, y1), P(x1, y1), P(x1, y1, hh), P(x0, y1, hh)], b.wl)
    o += poly([P(x1, y0), P(x1, y1), P(x1, y1, hh), P(x1, y0, hh)], b.wr)
    for (let z = 22; z < hh - 6; z += 24) {
      for (let x = x0 + 14; x + 16 <= x1 - 10; x += 26) {
        const id = 'w' + wins.length; wins.push(id)
        o += poly([P(x, y1, z), P(x + 16, y1, z), P(x + 16, y1, z + 12), P(x, y1, z + 12)], Math.random() < 0.35 ? '#FFE3A8' : 'rgba(44,110,127,.28)', 'id="' + id + '"')
      }
      for (let y = y0 + 14; y + 16 <= y1 - 10; y += 26) {
        const id = 'w' + wins.length; wins.push(id)
        o += poly([P(x1, y, z), P(x1, y + 16, z), P(x1, y + 16, z + 12), P(x1, y, z + 12)], Math.random() < 0.3 ? '#F6D58E' : 'rgba(21,24,26,.22)', 'id="' + id + '"')
      }
      o += '<polyline points="' + pts([P(x0, y1, z - 5), P(x1, y1, z - 5), P(x1, y0, z - 5)]) + '" fill="none" stroke="rgba(21,24,26,.07)"/>'
    }
    const dm = (x0 + x1) / 2
    o += poly([P(dm - 12, y1), P(dm + 12, y1), P(dm + 12, y1, 16), P(dm - 12, y1, 16)], '#3D3933')
    o += poly([P(x0, y0, hh), P(x1, y0, hh), P(x1, y1, hh), P(x0, y1, hh)], b.roof)
    o += poly([P(x0 + 10, y0 + 10, hh), P(x1 - 10, y0 + 10, hh), P(x1 - 10, y1 - 10, hh), P(x0 + 10, y1 - 10, hh)], 'rgba(255,255,255,.18)')
    const sg = P(x0 + 10, y1, hh - 4)
    o += '<g transform="matrix(.866 .5 0 1 ' + f(sg[0]) + ' ' + f(sg[1]) + ')"><rect x="0" y="-11" width="' + (b.name.length * 7 + 12) + '" height="13" rx="2" fill="#15181A"/><text x="6" y="-1.5" font-family="Geist Mono, monospace" font-size="8.5" letter-spacing="1" fill="#FFFFFF">' + b.name + '</text></g>'
    const r = P((x0 + x1) / 2, (y0 + y1) / 2, hh), w = (b.agent.length + 1) * 6.2 + 14
    o += '<g id="hn-a-' + bi + '" transform="translate(' + f(r[0]) + ' ' + f(r[1] - 8) + ')"><circle r="13" fill="none" stroke="#FFFFFF" stroke-width="1.5"><animate attributeName="r" values="12;26" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2.4s" repeatCount="indefinite"/></circle><rect x="-12" y="-12" width="24" height="24" rx="7" fill="#FFFFFF"/><path d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" fill="#F0662A"/><g transform="translate(0 -27)"><rect x="' + f(-w / 2) + '" y="-10" width="' + f(w) + '" height="20" rx="6" fill="#15181A"/><text y="3.6" text-anchor="middle" font-family="Geist Mono, monospace" font-size="10" fill="#FFFFFF">@' + b.agent + '</text></g></g>'
    return o + '</g>'
  }
  const person = (p, bi, pi) => {
    const q = P(p[0], p[1], 0)
    return '<g id="hn-p-' + bi + '-' + pi + '" transform="translate(' + f(q[0]) + ' ' + f(q[1] - 12) + ')"><ellipse cy="12" rx="9" ry="3.6" fill="rgba(0,0,0,.25)"/><circle r="11" fill="' + AV[pi % 3] + '" stroke="#FFFFFF" stroke-width="1.8"/><text y="3.2" text-anchor="middle" font-family="Geist, sans-serif" font-size="8.5" font-weight="600" fill="#FFFFFF">' + p[2] + '</text><circle cx="8" cy="8" r="3" fill="#4ADE80" stroke="#FFFFFF" stroke-width="1.3"/></g>'
  }
  const people = (bi) => BUILDINGS[bi].ppl.map((p, i) => person(p, bi, i)).join('')

  let s = '<svg viewBox="0 0 760 470" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible"><defs><radialGradient id="hnG"><stop offset="0" stop-color="#F0662A" stop-opacity=".5"/><stop offset="1" stop-color="#F0662A" stop-opacity="0"/></radialGradient><linearGradient id="hnBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE3CC" stop-opacity=".55"/><stop offset="1" stop-color="#FFE3CC" stop-opacity="0"/></linearGradient></defs>'
  s += poly([P(-20, -20), P(620, -20), P(620, 620), P(-20, 620)], 'rgba(255,255,255,.04)', 'stroke="rgba(255,255,255,.12)"')
  s += poly([P(255, -20), P(345, -20), P(345, 620), P(255, 620)], 'rgba(255,255,255,.07)')
  s += poly([P(-20, 255), P(620, 255), P(620, 345), P(-20, 345)], 'rgba(255,255,255,.07)')
  ;[[300, -20, 300, 620], [-20, 300, 620, 300]].forEach((l) => {
    const a1 = P(l[0], l[1]), a2 = P(l[2], l[3])
    s += '<line x1="' + f(a1[0]) + '" y1="' + f(a1[1]) + '" x2="' + f(a2[0]) + '" y2="' + f(a2[1]) + '" stroke="rgba(255,255,255,.22)" stroke-dasharray="6 8"/>'
  })
  const cF = P(300, 300)
  s += '<ellipse cx="' + f(cF[0]) + '" cy="' + f(cF[1]) + '" rx="190" ry="108" fill="url(#hnG)"/>'
  s += building(BUILDINGS[0], 0) + building(BUILDINGS[1], 1) + people(0) + people(1)
  s += building(BUILDINGS[2], 2) + people(2)
  const CH = 108, cT = P(300, 300, CH)
  s += poly([P(258, 342), P(342, 342), P(342, 342, CH), P(258, 342, CH)], '#C2553A')
  s += poly([P(342, 258), P(342, 342), P(342, 342, CH), P(342, 258, CH)], '#A8462F')
  for (let z = 20; z < CH; z += 22) s += '<polyline points="' + pts([P(258, 342, z), P(342, 342, z), P(342, 258, z)]) + '" fill="none" stroke="rgba(255,227,204,.35)" stroke-width="1.2"/>'
  s += poly([P(258, 258, CH), P(342, 258, CH), P(342, 342, CH), P(258, 342, CH)], '#F0662A')
  s += '<rect x="' + f(cT[0] - 22) + '" y="' + f(cT[1] - 150) + '" width="44" height="150" fill="url(#hnBeam)"/>'
  for (let k = 0; k < 2; k++) s += '<ellipse cx="' + f(cT[0]) + '" cy="' + f(cT[1]) + '" rx="18" ry="10" fill="none" stroke="#FFE3CC" stroke-width="1.5"><animate attributeName="rx" values="18;74" dur="2.8s" begin="' + (k * 1.4) + 's" repeatCount="indefinite"/><animate attributeName="ry" values="10;42" dur="2.8s" begin="' + (k * 1.4) + 's" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2.8s" begin="' + (k * 1.4) + 's" repeatCount="indefinite"/></ellipse>'
  s += '<text x="' + f(cT[0]) + '" y="' + f(cT[1] + 10) + '" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-size="30" fill="#FFFFFF">H</text>'
  s += building(BUILDINGS[3], 3) + people(3)
  s += '<g id="hn-bub"></g><g id="hn-pk"></g></svg>'
  host.innerHTML = s + '<div data-card style="position:absolute;left:0;top:0;width:234px;pointer-events:none;opacity:0;z-index:3"><div data-in style="padding:10px 12px;border-radius:13px;background:#FFFCF7;border:1px solid rgba(21,24,26,.08);box-shadow:0 20px 40px -14px rgba(0,0,0,.55);color:#15181A;font-family:Geist, sans-serif"></div></div>'

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => { host.innerHTML = '' }

  const svgEl = host.querySelector('svg'), pk = svgEl.querySelector('#hn-pk'), bub = svgEl.querySelector('#hn-bub')
  const cardO = host.querySelector('[data-card]'), cardI = cardO.firstChild
  const roofs = BUILDINGS.map((b) => { const r = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.h); return [r[0], r[1] - 8] })
  const anchors = BUILDINGS.map((b) => b.ppl.map((p) => { const q = P(p[0], p[1], 0); return [q[0], q[1] - 12] }))
  const core = [cT[0], cT[1] - 4]
  const live = [], timers = new Set()
  let raf = 0, vis = true, stopped = false

  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t) }
  const spawn = (a, b, c, dur, lift, done) => {
    const g = document.createElementNS(NS, 'g')
    g.innerHTML = '<circle r="7" fill="' + c + '" opacity=".28"/><circle r="3.2" fill="' + c + '"/>'
    pk.appendChild(g)
    live.push({ g, a, b, t0: performance.now(), dur, lift, done })
  }
  const tick = (now) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i], t = (now - p.t0) / p.dur
      if (t >= 1) { p.g.remove(); live.splice(i, 1); p.done && p.done(); continue }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      p.g.setAttribute('transform', 'translate(' + f(p.a[0] + (p.b[0] - p.a[0]) * e) + ' ' + f(p.a[1] + (p.b[1] - p.a[1]) * e - Math.sin(Math.PI * e) * p.lift) + ')')
    }
    if (!stopped) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const rnd = (n) => Math.floor(Math.random() * n)
  const chat = (pt) => {
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('transform', 'translate(' + f(pt[0] + 10) + ' ' + f(pt[1] - 26) + ')')
    g.innerHTML = '<rect x="0" y="-9" width="26" height="15" rx="7.5" fill="#FFFFFF"/><path d="M3 5 L0 10 L8 5 Z" fill="#FFFFFF"/><circle cx="7" cy="-1.5" r="1.6" fill="#57534C"/><circle cx="13" cy="-1.5" r="1.6" fill="#57534C"/><circle cx="19" cy="-1.5" r="1.6" fill="#57534C"/>'
    bub.appendChild(g)
    g.animate([{ opacity: 0, transform: g.getAttribute('transform') + ' scale(.6)' }, { opacity: 1, transform: g.getAttribute('transform') + ' scale(1)' }], { duration: 220, fill: 'forwards' })
    later(() => g.remove(), 1600)
  }
  const ambient = setInterval(() => {
    if (!vis || document.hidden) return
    const i = rnd(4), j = (i + 1 + rnd(3)) % 4
    if (Math.random() < 0.5) spawn(anchors[i][rnd(3)], core, '#FFE3CC', 1300, 6, () => spawn(core, roofs[j], '#F6A15B', 1100, 30))
    else { chat(anchors[i][rnd(3)]); spawn(roofs[i], roofs[j], '#9CCAD3', 1500, 70) }
    const w = svgEl.querySelector('#' + wins[rnd(wins.length)])
    if (w) w.setAttribute('fill', w.getAttribute('fill').charAt(0) === '#' ? 'rgba(44,110,127,.28)' : '#FFE3A8')
  }, 650)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { vis = e.isIntersecting }) : null
  io && io.observe(host)

  const run = (k) => {
    if (stopped) return
    if (!vis || document.hidden) { later(() => run(k), 800); return }
    const sc = SCENARIOS[k % SCENARIOS.length], anchor = anchors[sc.b][sc.p], pg = svgEl.querySelector('#hn-p-' + sc.b + '-' + sc.p)
    const ring = document.createElementNS(NS, 'circle')
    ring.setAttribute('r', '15'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#F0662A'); ring.setAttribute('stroke-width', '2.4')
    pg && pg.appendChild(ring)
    const W = host.getBoundingClientRect().width, left = sc.b === 0 || sc.b === 2
    cardO.style.left = (left ? 4 : W - 238) + 'px'
    cardO.style.top = (sc.b < 2 ? 0 : W * 470 / VW - 130) + 'px'
    const ini = BUILDINGS[sc.b].ppl[sc.p][2], mlen = sc.msg.indexOf(' ')
    cardI.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="width:26px;height:26px;flex:none;border-radius:50%;background:' + AV[sc.p % 3] + ';color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600">' + ini + '</span><div style="min-width:0;flex:1"><div style="font-size:12.5px;font-weight:600;line-height:1.2">' + sc.name + '</div><div style="font-size:10.5px;line-height:1.3;color:#77726A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sc.role + '</div></div></div><div data-m style="margin-top:7px;font-size:12.5px;line-height:1.4;min-height:18px"></div><div data-r style="display:none"></div>'
    const m = cardI.querySelector('[data-m]'), rp = cardI.querySelector('[data-r]')
    cardO.style.opacity = '1'
    cardI.animate([{ opacity: 0, transform: 'translateY(6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' })
    chat(anchor)
    let n = 0
    const type = () => {
      n += 1
      const sub = sc.msg.slice(0, n)
      m.innerHTML = '<span style="color:#C4501E;font-family:Geist Mono, monospace;font-size:11.5px">' + sub.slice(0, mlen) + '</span>' + sub.slice(mlen) + '<span style="display:inline-block;width:6px;height:13px;margin-left:1px;vertical-align:-2px;background:#15181A;animation:hn-blink 1s step-end infinite"></span>'
      if (n < sc.msg.length) { later(type, 32); return }
      spawn(anchor, roofs[sc.b], '#F0662A', 700, 10, () => spawn(roofs[sc.b], core, '#F0662A', 800, 30, () => spawn(core, roofs[sc.to], '#F0662A', 900, 40, () => spawn(roofs[sc.to], roofs[sc.b], '#9CCAD3', 1100, 80, () => {
        m.lastChild && m.lastChild.remove()
        rp.style.cssText = 'display:flex;gap:7px;align-items:flex-start;margin-top:8px;padding-top:8px;border-top:1px solid rgba(21,24,26,.08)'
        rp.innerHTML = '<span style="width:18px;height:18px;flex:none;border-radius:5px;background:#F0662A;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="10" height="10"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="#FFFFFF"/></svg></span><div style="font-size:11.5px;line-height:1.45;color:#3D3933"><span style="font-family:Geist Mono, monospace;color:#C4501E">@' + BUILDINGS[sc.b].agent + '</span> · ' + sc.rep + '</div>'
        rp.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 280, fill: 'both' })
        later(() => {
          cardI.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'both' })
          later(() => { ring.remove(); cardO.style.opacity = '0'; later(() => run(k + 1), 450) }, 280)
        }, 3000)
      }))))
    }
    later(type, 360)
  }
  later(() => run(0), 1400)

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    clearInterval(ambient)
    timers.forEach(clearTimeout)
    io && io.disconnect()
    host.innerHTML = ''
  }
}
