"use client";

import { useState } from "react";

import { createClientSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onMagicLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClientSupabase();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setMessage("ログインリンクを送信しました。メールをご確認ください。");
  };

  const onPasswordLogin = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClientSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    window.location.href = "/dashboard";
  };

  const onSignUp = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClientSupabase();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage("ユーザーを作成しました。確認メール設定が無効ならこのままログインできます。");
  };

  return (
    <main className="app-shell" style={{ display: "grid", placeItems: "center" }}>
      <section className="card" style={{ width: "min(460px, 100%)", padding: 26 }}>
        <h1 className="headline" style={{ margin: "0 0 8px" }}>
          Anime Scheduler
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          制作進行用のテーブル＋ガントを共有するためのログイン
        </p>

        <form onSubmit={onMagicLink} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>メールアドレス</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>パスワード（開発用ログイン）</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8文字以上"
              minLength={8}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="primary"
              disabled={loading || !email || !password}
              type="button"
              onClick={() => {
                void onPasswordLogin();
              }}
            >
              {loading ? "処理中..." : "パスワードでログイン"}
            </button>
            <button
              disabled={loading || !email || !password}
              type="button"
              onClick={() => {
                void onSignUp();
              }}
            >
              初回ユーザー作成
            </button>
          </div>

          <button className="primary" disabled={loading} type="submit">
            {loading ? "送信中..." : "ログインリンク送信"}
          </button>
        </form>

        {message ? <p style={{ color: "var(--green)", marginBottom: 0 }}>{message}</p> : null}
        {error ? <p style={{ color: "var(--danger)", marginBottom: 0 }}>{error}</p> : null}
      </section>
    </main>
  );
}
