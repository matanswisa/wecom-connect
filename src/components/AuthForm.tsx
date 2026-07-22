"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "הפעולה נכשלה.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup">
          <Image src="/wecom-logo.svg" alt="wecom" width={132} height={60} priority />
          <span>connect</span>
        </div>
        <h1>{mode === "login" ? "כניסה למערכת" : "יצירת משתמש"}</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" ? (
            <>
              <label>
                שם מלא
                <input name="name" required autoComplete="name" />
              </label>
              <label>
                סוג משתמש
                <select name="role" defaultValue="EMPLOYEE">
                  <option value="EMPLOYEE">עובד</option>
                  <option value="MANAGER">מנהלת</option>
                </select>
              </label>
            </>
          ) : null}
          <label>
            אימייל
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            סיסמה
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "שומר..." : mode === "login" ? "כניסה" : "הרשמה"}
          </button>
        </form>
        <a className="auth-link" href={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "אין לך משתמש? הרשמה" : "כבר יש משתמש? כניסה"}
        </a>
      </section>
    </main>
  );
}
