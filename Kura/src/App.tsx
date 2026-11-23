import { useState } from "react";
import { Route, Switch } from "wouter";
import { ErrorBoundary } from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import PortalPage from "./pages/PortalPage";
import type { StaffUser } from "./types/clinical";

const SESSION_KEY = "kura_staff_session";

export function App() {
  const [user, setUser] = useState<StaffUser | null>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      return saved ? (JSON.parse(saved) as StaffUser) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (loggedUser: StaffUser) => {
    setUser(loggedUser);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(loggedUser));
    } catch {
      // ignore storage errors
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setUser(null);
  };

  return (
    <ErrorBoundary>
      {!user ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <Switch>
          <Route path="/:rest*">{() => <PortalPage user={user} onLogout={handleLogout} />}</Route>
          <Route>{() => <PortalPage user={user} onLogout={handleLogout} />}</Route>
        </Switch>
      )}
    </ErrorBoundary>
  );
}

export default App;
