try {
  process.loadEnvFile?.();
} catch {
  // En Vercel las variables se inyectan desde el panel del proyecto
}

import app from "./app";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Puerto inválido: "${rawPort}"`);
}

app.listen(port, () => {
  const geminiReady = Boolean(process.env.GEMINI_API_KEY?.trim());
  const neonReady = Boolean(process.env.DATABASE_URL?.trim());
  console.log(`[Kura API] Servidor activo en http://localhost:${port}`);
  console.log(`[Kura IA]  Google Gemini: ${geminiReady ? "API Key cargada (Texto + Voz)" : "Sin GEMINI_API_KEY (motor local)"}`);
  console.log(`[Kura DB]  PostgreSQL Neon: ${neonReady ? "Conectado (DATABASE_URL activo)" : "Modo memoria local"}`);
});