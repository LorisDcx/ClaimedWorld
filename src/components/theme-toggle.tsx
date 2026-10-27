'use client';
import { useT } from '@/i18n/provider';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export default function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      let next = window.matchMedia("(prefers-color-scheme: dark)").matches;
      try {
        const saved = localStorage.getItem('claimed-theme');
        if (saved === 'dark' || saved === 'light') next = saved === 'dark';
      } catch {}
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      setDark(next);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label={dark ? t("Activer le mode clair") : t("Activer le mode sombre")}
      aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        try {
          localStorage.setItem('claimed-theme', next ? 'dark' : 'light');
        } catch {}
      }}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
