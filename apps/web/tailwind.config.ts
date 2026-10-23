import type { Config } from 'tailwindcss';
import {
  DRAWER_IN_MS,
  DRAWER_OUT_MS,
  EASE_DRAWER,
  EASE_OUT,
  POPOVER_IN_MS,
  POPOVER_OUT_MS,
  PRESS_MS,
  STEP_ENTER_MS,
  ms,
  toCubicBezier,
} from './src/lib/motion';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        'border-hover': 'var(--border-hover)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-press': 'var(--accent-press)',
        'accent-fg': 'var(--accent-fg)',
        'accent-soft': 'var(--accent-soft)',
        'accent-soft-2': 'var(--accent-soft-2)',
        'accent-text': 'var(--accent-text)',
        danger: 'var(--danger)',
        'danger-hover': 'var(--danger-hover)',
        'danger-press': 'var(--danger-press)',
        'danger-soft': 'var(--danger-soft)',
        'danger-text': 'var(--danger-text)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        focus: 'var(--focus)',
        'sheet-bg': 'var(--sheet-bg)',
        scrim: 'var(--scrim)',
      },
      boxShadow: {
        DEFAULT: 'var(--shadow)',
        btn: 'var(--shadow-btn)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      transitionDuration: {
        press: ms(PRESS_MS),
        'popover-in': ms(POPOVER_IN_MS),
        'popover-out': ms(POPOVER_OUT_MS),
        'drawer-in': ms(DRAWER_IN_MS),
        'drawer-out': ms(DRAWER_OUT_MS),
      },
      transitionTimingFunction: {
        'out-motion': toCubicBezier(EASE_OUT),
        drawer: toCubicBezier(EASE_DRAWER),
      },
      keyframes: {
        'drawer-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'drawer-out': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'popover-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'popover-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.96)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
      },
      animation: {
        'drawer-in': `drawer-in ${ms(DRAWER_IN_MS)} ${toCubicBezier(EASE_DRAWER)}`,
        'drawer-out': `drawer-out ${ms(DRAWER_OUT_MS)} ${toCubicBezier(EASE_DRAWER)}`,
        'overlay-in': `overlay-in ${ms(DRAWER_IN_MS)} ${toCubicBezier(EASE_DRAWER)}`,
        'overlay-out': `overlay-out ${ms(DRAWER_OUT_MS)} ${toCubicBezier(EASE_DRAWER)}`,
        'popover-in': `popover-in ${ms(POPOVER_IN_MS)} ${toCubicBezier(EASE_OUT)}`,
        'popover-out': `popover-out ${ms(POPOVER_OUT_MS)} ${toCubicBezier(EASE_OUT)}`,
        'fade-in-150': `fade-in ${ms(STEP_ENTER_MS)} ${toCubicBezier(EASE_OUT)}`,
        'fade-out-150': `fade-out ${ms(STEP_ENTER_MS)} ${toCubicBezier(EASE_OUT)}`,
        'popover-fade-in': `fade-in ${ms(POPOVER_IN_MS)} ${toCubicBezier(EASE_OUT)}`,
        'popover-fade-out': `fade-out ${ms(POPOVER_OUT_MS)} ${toCubicBezier(EASE_OUT)}`,
      },
    },
  },
  plugins: [],
};

export default config;
