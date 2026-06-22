# CarPool Connect — Neon Pulse Design System

Design package for the futuristic, automated carpool experience.

---

## 1. Mood board & concept

**Theme name:** Neon Pulse  
**Audience:** Young professionals & corporate commuters in India  
**Purpose:** Smart, automated ride-matching that feels cutting-edge—not corporate-dull  

| Inspiration | Application |
|-------------|-------------|
| Cyberpunk city lights | Violet + cyan + magenta gradients |
| Glass HUD interfaces | Frosted panels, blur, subtle grid |
| Autonomous mobility apps | Clean route booking, map-first flows |
| Fintech neobanks | Bold typography, confident spacing |
| Night-drive dashboards | Rich dark mode with neon accents |

**Emotional goals:** Energy · Trust · Speed · Delight

---

## 2. Color palette

### Light mode
| Token | Hex | Usage |
|-------|-----|--------|
| Violet primary | `#7c3aed` | CTAs, links, brand |
| Electric cyan | `#06b6d4` / `#22d3ee` | Accents, focus rings, live states |
| Hot magenta | `#ec4899` | Hero gradients, drop location |
| Background | `#eef2ff` | Page canvas |
| Text | `#1e1b4b` | Headings & body |

### Dark mode
| Token | Hex | Usage |
|-------|-----|--------|
| Soft violet | `#a78bfa` | Primary on dark |
| Neon cyan | `#22d3ee` | Active nav, glow |
| Pink accent | `#f472b6` | Gradients |
| Void bg | `#070b14` | Canvas |
| Glass surface | `rgba(14,20,40,0.88)` | Cards & sidebar |

**Brand gradient:** `violet → cyan → magenta` (135deg, animated)

---

## 3. Wireframe map (screens)

```
┌─────────────┬──────────────────────────────────┐
│  SIDEBAR    │  TOPBAR (mobile) + content         │
│  · Dashboard│  ┌─ Hero / Page header ─────────┐ │
│  · Live Map │  │ Book ride (Route planner)     │ │
│  · Find Pool│  │ · Pickup From · Drop Location │ │
│  · Requests │  │ · Add from Map (single btn)   │ │
│  · Alerts   │  └───────────────────────────────┘ │
│  · Profile  │  Quick actions · Cards · Map       │
│  · Theme    │  Recommendations grid            │
└─────────────┴──────────────────────────────────┘

Auth: Split — animated gradient visual | glass login card
Profile: Sidebar avatar + Appearance (Light/Dark/System)
```

---

## 4. Typography

| Role | Font | Weight |
|------|------|--------|
| Display / headings | **Syne** | 700–800 |
| Body / UI | **Plus Jakarta Sans** | 400–600 |

---

## 5. Components & patterns

- **Glass panels:** `--glass-bg` + `backdrop-filter: blur(12–20px)`
- **Neon glow:** `--neon-glow-soft` on primary buttons & hovers
- **Mesh background:** Radial gradients + subtle grid (body pseudo-elements)
- **Route planner:** Animated top accent bar; segment tabs
- **Cards:** Glass + lift on hover (`translateY(-3px)`)

---

## 6. Motion

| Animation | Duration | Use |
|-----------|----------|-----|
| `page-enter` | 0.45s | Route changes |
| `gradient-shift` | 6–14s | Hero, buttons, brand bar |
| `neon-pulse` | 2s | Primary button hover |
| `float-y` | 8s | Hero decorative orb |
| Stagger children | +0.03s each | Dashboard quick actions |

Respect `prefers-reduced-motion` in future iterations.

---

## 7. Dark theme

- Same component structure as light
- Higher contrast neon accents on void background
- Glass borders use violet tint `--glass-border`
- Toggle: header icon · sidebar · Profile → Appearance

Storage key: `localStorage.carpool-theme` → `light` | `dark` | `system`

---

## 8. Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| ≤900px | Sidebar hidden; bottom nav; sticky topbar |
| ≤640px | Single-column forms; stacked theme picker |
| Touch | 44px min tap targets |

---

## 9. Implementation files

| Asset | Path |
|-------|------|
| Design tokens | `frontend/src/index.css` (`:root`, `[data-theme='dark']`) |
| Futuristic layer | `frontend/src/styles/futuristic.css` |
| Theme logic | `frontend/src/context/ThemeContext.jsx` |
| Theme UI | `frontend/src/components/ThemeToggle.jsx` |
| Layout shell | `frontend/src/components/Layout.jsx` + `.css` |
| Auth screens | `frontend/src/pages/Auth.css` |
| Booking UI | `frontend/src/components/RoutePlanner.*` |

---

## 10. Developer guidelines

1. **Always use CSS variables** — never hardcode `#2563eb`-style legacy blues.
2. **Headings** — apply `font-family: var(--font-display)` for h1/h2 brand moments.
3. **Surfaces** — prefer `--glass-bg` / `--color-surface` over raw white.
4. **Focus states** — cyan ring: `box-shadow: 0 0 0 3px var(--color-accent-soft)`.
5. **New screens** — wrap content in `.page-enter`; use `.card` for grouped content.
6. **Dark mode** — test both themes before shipping UI changes.

---

*Neon Pulse v1.0 — CarPool Connect*
