import { useState } from "react";

export default function FounderLoginGate() {
  const [adminKey, setAdminKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitAuth(body) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/founder/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Acesso negado.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="founder-cockpit-page founder-cockpit-page--gate">
      <header className="founder-cockpit-header">
        <img src="/teilor-logo.svg" alt="Teilor" width={140} height={32} />
        <h1>Cockpit Executivo</h1>
        <p>Acesso restrito ao fundador. Autentique-se para continuar.</p>
      </header>

      <div className="founder-login-panel">
        <form
          className="founder-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitAuth({ admin_key: adminKey });
          }}
        >
          <label htmlFor="founder-admin-key">Chave administrativa</label>
          <input
            id="founder-admin-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="MIA_ADMIN_API_KEY"
          />
          <button type="submit" disabled={loading || !adminKey.trim()}>
            Entrar com chave admin
          </button>
        </form>

        <div className="founder-login-divider">ou</div>

        <form
          className="founder-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitAuth({ session_token: sessionToken });
          }}
        >
          <label htmlFor="founder-session-token">Token de sessão MIA (fundador autorizado)</label>
          <input
            id="founder-session-token"
            type="password"
            autoComplete="off"
            value={sessionToken}
            onChange={(event) => setSessionToken(event.target.value)}
            placeholder="Bearer session token"
          />
          <button type="submit" disabled={loading || !sessionToken.trim()}>
            Entrar com sessão
          </button>
        </form>

        {error ? (
          <p className="founder-login-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
