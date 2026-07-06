'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/** Dark-mode toggle. Persists to localStorage and flips the `dark` class on <html>. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  };

  return (
    <button className="foot-item" onClick={toggle} type="button">
      <span className="ico">{dark ? <Sun size={18} /> : <Moon size={18} />}</span>
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}

/** Inline script (runs before paint) that applies the saved theme so there's no flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
