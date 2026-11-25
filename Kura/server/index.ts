try {
  process.loadEnvFile?.();
} catch {
  // Si no existe .env, continúa con valores por defecto en memoria
}

import app from "./app";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Puerto inválido: "${rawPort}"`);
}

app.listen(port, () => {
  const aiReady = Boolean(process.env.HF_TOKEN?.startsWith("hf_"));
  console.log(`[Kura API] Servidor activo en http://localhost:${port}`);
  console.log(`[Kura IA]  Hugging Face: ${aiReady ? "Token cargado (Qwen 2.5 + Whisper)" : "Sin HF_TOKEN (usando motor local)"}`);
});