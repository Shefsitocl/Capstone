//server/app.ts
import express from "express";
import cors from "cors";
import { kuraStore } from "./store";

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

function getStaffRole(req: express.Request): string {
  const raw = req.headers["x-staff-role"];
  if (typeof raw !== "string") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
app.use("/api", async (req, res, next) => {
  await kuraStore.ensureReady();
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const originalSend = res.send.bind(res);
    let persisted = false;
    res.send = ((body?: unknown) => {
      if (!persisted && res.statusCode < 400) {
        persisted = true;
        kuraStore
          .persistToNeon()
          .catch((err) => console.error("[Kura Neon] Error al guardar:", err))
          .finally(() => {
            originalSend(body);
          });
        return res;
      }
      return originalSend(body);
    }) as typeof res.send;
  }
  next();
});
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", service: "Kura API", aiConnected: Boolean(kuraStore.getGeminiApiKey()) });
});

app.get("/api/bootstrap", (req, res) => {
  const role = getStaffRole(req);
  res.json(kuraStore.getBootstrapData(role));
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    res.status(400).json({ error: "Ingresa tu correo institucional y contraseña." });
    return;
  }
  const user = kuraStore.authenticate(email, password);
  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas para el equipo CESFAM." });
    return;
  }
  res.json({ user });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/appointments", (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const fullName = String(body.fullName || "").trim();
  const rut = String(body.rut || "").trim();
  if (!fullName || !rut) {
    res.status(400).json({ ok: false, error: "Debes ingresar el nombre completo y el RUT chileno." });
    return;
  }
  const result = kuraStore.createRealPatientAndAppointment({
    fullName,
    rut,
    age: Number(body.age) || 35,
    phone: String(body.phone || "+56 9 8000 0000"),
    sector: String(body.sector || "Sector Azul"),
    distanceKm: Number(body.distanceKm) || 2.0,
    fonasaTramo: String(body.fonasaTramo || "B"),
    preferentialLaw: Boolean(body.preferentialLaw),
    totalAppointments: Number(body.totalAppointments) || 0,
    nspHistoryCount: Number(body.nspHistoryCount) || 0,
    specialty: String(body.specialty || "Odontología General"),
    professionalName: String(body.professionalName || "Dr. Sebastián Muñoz P."),
    boxNumber: String(body.boxNumber || "Box Dental 3"),
    dayLabel: String(body.dayLabel || "Hoy"),
    scheduledTime: String(body.scheduledTime || "12:30"),
    status: String(body.status || "Por confirmar"),
  });

  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result);
});

app.post("/api/appointments/:id/checkin", (req, res) => {
  const appt = kuraStore.manualCheckin(req.params.id, "MANUAL_SOME_DESK", 35);
  if (!appt) {
    res.status(404).json({ error: "Cita no encontrada en la agenda." });
    return;
  }
  res.json({ ok: true, appointment: appt });
});

app.post("/api/appointments/:id/confirm", (req, res) => {
  const appt = kuraStore.updateAppointmentStatus(req.params.id, "Confirmada", "Gestión SOME");
  if (!appt) {
    res.status(404).json({ error: "Cita no encontrada." });
    return;
  }
  res.json({ ok: true, appointment: appt });
});

app.post("/api/appointments/:id/cancel", (req, res) => {
  const appt = kuraStore.updateAppointmentStatus(req.params.id, "Cancelada");
  if (!appt) {
    res.status(404).json({ error: "Cita no encontrada." });
    return;
  }
  res.json({ ok: true, appointment: appt });
});

app.post("/api/appointments/:id/slot-fill", (req, res) => {
  const { waitlistId } = (req.body || {}) as { waitlistId?: unknown };
  const parsedId = typeof waitlistId === "number" ? waitlistId : undefined;
  const result = kuraStore.executeSlotFilling(req.params.id, parsedId);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/iot/checkin", (req, res) => {
  const t0 = performance.now();
  const {
    rawPayload,
    rut,
    deviceId = "TOTEM-SOME-01",
    hardwareType = "ESP32-CAM · Lector QR Cédula",
    offlineBuffered = false,
  } = (req.body || {}) as Record<string, unknown>;

  const input = String(rawPayload || rut || "").trim();
  if (!input) {
    res.status(400).json({ ok: false, error: "Debe enviar rawPayload (QR de cédula) o RUT." });
    return;
  }

  const elapsed = Math.max(18, Math.min(480, Math.round(performance.now() - t0) + 185));
  const result = kuraStore.checkinByRutOrQR(
    input,
    String(deviceId),
    String(hardwareType),
    Boolean(offlineBuffered),
    elapsed,
  );

  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/iot/batch-sync", (req, res) => {
  const { events = [] } = (req.body || {}) as {
    events?: Array<{ rawPayload?: string; rut?: string; deviceId?: string }>;
  };
  if (!Array.isArray(events)) {
    res.status(400).json({ ok: false, error: "El campo events debe ser un arreglo." });
    return;
  }
  const results = events.slice(0, 100).map((ev) =>
    kuraStore.checkinByRutOrQR(
      String(ev.rawPayload || ev.rut || ""),
      ev.deviceId || "TOTEM-SOME-01",
      "ESP32 RingBuffer Sync",
      true,
      42,
    ),
  );
  res.json({ ok: true, syncedCount: results.length, results });
});

app.post("/api/ml/recalculate", (req, res) => {
  const { modelVersion } = (req.body || {}) as { modelVersion?: string };
  const summary = kuraStore.recalculateAllRisks(modelVersion);
  res.json({ ok: true, ...summary });
});

app.post("/api/ml/sync", (req, res) => {
  const { modelVersion } = (req.body || {}) as { modelVersion?: string };
  const summary = kuraStore.recalculateAllRisks(modelVersion);
  res.json({ ok: true, ...summary });
});

app.post("/api/communications/analyze", async (req, res) => {
  const { patientId, channel, transcript } = (req.body || {}) as {
    patientId?: unknown;
    channel?: unknown;
    transcript?: unknown;
  };
  const pid = Number(patientId);
  const text = String(transcript || "").trim();
  if (Number.isNaN(pid) || !text) {
    res.status(400).json({ ok: false, error: "Selecciona un paciente y escribe un mensaje o transcripción de voz." });
    return;
  }
  const result = await kuraStore.analyzeAndRecordCommunication({
    patientId: pid,
    channel: String(channel || "WhatsApp Texto"),
    transcript: text,
  });
  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/communications/:id/review", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const updated = kuraStore.markCommunicationReviewed(id);
  if (!updated) {
    res.status(404).json({ error: "Registro no encontrado." });
    return;
  }
  res.json({ ok: true, item: updated });
});

// Solo SOPORTE IOT / TÓTEM puede editar conectores
app.put("/api/connectors/:id", (req, res) => {
  const role = getStaffRole(req);
  if (!kuraStore.canEditSystemAdmin(role)) {
    res.status(403).json({ error: "Acceso denegado: solo Soporte TI puede modificar conectores o API Keys." });
    return;
  }
  const updated = kuraStore.updateConnector(req.params.id, req.body || {});
  if (!updated) {
    res.status(404).json({ error: "Conector no encontrado." });
    return;
  }
  res.json({ ok: true, connector: updated });
});

// Solo SOPORTE IOT / TÓTEM puede reiniciar entorno piloto
app.post("/api/reset-demo", (req, res) => {
  const role = getStaffRole(req);
  if (!kuraStore.canEditSystemAdmin(role)) {
    res.status(403).json({ error: "Acceso denegado: solo Soporte TI puede reiniciar los datos de demostración." });
    return;
  }
  res.json(kuraStore.resetDemo());
});

export default app;
