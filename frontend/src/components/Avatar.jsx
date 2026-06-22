import './Avatar.css';

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const COLORS = [
  ['#dbeafe', '#1d4ed8'],
  ['#d1fae5', '#047857'],
  ['#fce7f3', '#be185d'],
  ['#fef3c7', '#b45309'],
  ['#e0e7ff', '#4338ca'],
  ['#ccfbf1', '#0f766e'],
];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ name, size = 'md' }) {
  const [bg, color] = colorForName(name);
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: bg, color }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
