tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'] },
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        ink: 'var(--ink)',
        inksoft: 'var(--ink-soft)',
        inkfaint: 'var(--ink-faint)',
        line: 'var(--line)',
        linestrong: 'var(--line-strong)',
        accent: 'var(--accent)',
        accentdeep: 'var(--accent-deep)',
        accentsoft: 'var(--accent-soft)',
        accentink: 'var(--accent-ink)',
        good: 'var(--good)',
        goodsoft: 'var(--good-soft)',
        bad: 'var(--bad)',
        badsoft: 'var(--bad-soft)',
        cardpink: 'var(--card-pink)',
        cardpinkdeep: 'var(--card-pink-deep)',
        cardyellow: 'var(--card-yellow)',
        cardyellowdeep: 'var(--card-yellow-deep)',
        cardblue: 'var(--card-blue)',
        cardbluedeep: 'var(--card-blue-deep)',
        cardgreen: 'var(--card-green)',
        cardgreendeep: 'var(--card-green-deep)',
        cardorange: 'var(--card-orange)',
        cardorangedeep: 'var(--card-orange-deep)',
        cardteal: 'var(--card-teal)',
        cardtealdeep: 'var(--card-teal-deep)',
        cardrose: 'var(--card-rose)',
        cardrosedeep: 'var(--card-rose-deep)',
        cardindigo: 'var(--card-indigo)',
        cardindigodeep: 'var(--card-indigo-deep)',
        cardcyan: 'var(--card-cyan)',
        cardcyandeep: 'var(--card-cyan-deep)',
        cardgray: 'var(--card-gray)',
        cardgraydeep: 'var(--card-gray-deep)',
        cardicon: 'var(--card-icon)'
      },
      boxShadow: { card: '0 1px 2px rgba(21, 18, 31, 0.05)' },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } }
      },
      animation: { 'fade-in': 'fade-in .28s ease both' }
    }
  }
};
