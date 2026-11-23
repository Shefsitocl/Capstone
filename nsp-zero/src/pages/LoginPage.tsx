import { type FormEvent, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { StaffUser } from "../types/clinical";

interface LoginPageProps {
  onLogin: (user: StaffUser) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Credenciales inválidas. Verifica tu correo y contraseña.");
      } else {
        onLogin(data.user);
      }
    } catch {
      setError("No se pudo conectar con el servidor API. Verifica que el servicio esté activo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo-kura.png" alt="Kura" width={50} height={50} />
          <div>
            <span className="eyebrow" style={{ marginBottom: 2, display: "block" }}>
              Atención Primaria de Salud · Chile
            </span>
            <h1 style={{ margin: 0, fontSize: 23, fontFamily: "var(--app-font-serif)", letterSpacing: "-0.4px" }}>
              Kura · CESFAM
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#475569" }}>
              Gestión Predictiva, Omnicanal y Check-In Tótem SOME
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
          <div className="field">
            <label htmlFor="email">Correo institucional</label>
            <input
              id="email"
              type="email"
              className="control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@cesfam.cl"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="banner caution" style={{ marginBottom: 0 }}>
              <div>{error}</div>
            </div>
          )}

          <button type="submit" className="button primary" style={{ width: "100%", height: 42, marginTop: 4 }} disabled={loading}>
            <LockKeyhole size={15} />
            {loading ? "Verificando acceso..." : "Ingresar al Panel Clínico"}
          </button>
        </form>

        <div className="inline-note" style={{ marginTop: 18 }}>
          <ShieldCheck size={15} />
          <span>Acceso restringido a funcionarios autorizados · Cumplimiento Ley 20.584 y Ley 19.628.</span>
        </div>
      </div>
    </div>
  );
}
