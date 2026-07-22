"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("wecomconnect-theme", nextTheme);
    setTheme(nextTheme);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      title={isDark ? "מצב בהיר" : "מצב כהה"}
      aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
