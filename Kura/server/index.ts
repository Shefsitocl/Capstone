import app from "./app";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Puerto inválido: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`[Kura API] Servidor activo en http://localhost:${port}`);
});
