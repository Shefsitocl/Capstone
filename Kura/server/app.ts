//server/app.ts
import express from "express";
import cors from "cors";
import { kuraStore } from "./store.js";

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

const processedTwilioSids = new Set<string>();

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

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno.");
  }

  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const firstRes = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${basicAuth}` },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });

  if (firstRes.status >= 300 && firstRes.status < 400) {
    const redirectLocation = firstRes.headers.get("location");
    if (!redirectLocation) {
      throw new Error(`Redirección sin destino desde Twilio (${firstRes.status})`);
    }
    const cdnRes = await fetch(redirectLocation, {
      signal: AbortSignal.timeout(8000),
    });
    if (!cdnRes.ok) {
      throw new Error(`Error descargando archivo desde CDN de Twilio (${cdnRes.status})`);
    }
    return Buffer.from(await cdnRes.arrayBuffer());
  }

  if (!firstRes.ok) {
    throw new Error(`Error descargando audio desde Twilio (${firstRes.status})`);
  }

  return Buffer.from(await firstRes.arrayBuffer());
}

async function sendTwilioWhatsappMessage(toPhone: string, messageBody: string) {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromNumber = (process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+17372508034").trim();

  if (!sid || !token) {
    throw new Error("Credenciales de Twilio no configuradas en el servidor.");
  }

  const cleanDigits = toPhone.replace(/[^\d+]/g, "");
  const formattedTo = toPhone.startsWith("whatsapp:")
    ? toPhone
    : `whatsapp:${cleanDigits.startsWith("+") ? cleanDigits : `+${cleanDigits}`}`;
  const formattedFrom = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;

  const params = new URLSearchParams();
  params.append("To", formattedTo);
  params.append("From", formattedFrom);
  params.append("Body", messageBody.slice(0, 1500));

  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  });

  const data = (await resp.json()) as { sid?: string; message?: string; status?: string };
  if (!resp.ok) {
    throw new Error(data.message || `Error Twilio API (${resp.status})`);
  }
  return data;
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
  res.json({
    status: "ok",
    service: "Kura API",
    aiConnected: Boolean(kuraStore.getGeminiApiKey()),
    twilioConnected: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  });
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

// Webhook entrante de WhatsApp (Twilio: texto y notas de voz)
app.post("/api/webhooks/twilio", async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const messageSid = String(body.MessageSid || body.SmsMessageSid || "").trim();
    const fromRaw = String(body.From || "").trim();
    const textBody = String(body.Body || "").trim();
    const numMedia = Number(body.NumMedia || 0);
    const mediaUrl0 = String(body.MediaUrl0 || "").trim();
    const mediaType0 = String(body.MediaContentType0 || "audio/ogg").trim();

    if (messageSid) {
      if (processedTwilioSids.has(messageSid)) {
        res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
        return;
      }
      processedTwilioSids.add(messageSid);
      if (processedTwilioSids.size > 500) {
        const oldest = processedTwilioSids.values().next().value;
        if (oldest) processedTwilioSids.delete(oldest);
      }
    }

    if (/^join\s+/i.test(textBody) && numMedia === 0) {
      res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    let transcript = textBody;
    let channel = "WhatsApp Real (Twilio)";

    if (numMedia > 0 && mediaUrl0 && mediaType0.startsWith("audio/")) {
      channel = "Nota de Voz WhatsApp";
      try {
        const audioBuffer = await downloadTwilioMedia(mediaUrl0);
        const transcribed = await kuraStore.transcribeAudioBuffer(audioBuffer, mediaType0);
        transcript = textBody ? `${transcribed} (${textBody})` : transcribed;
      } catch (audioErr) {
        console.error("[Kura Twilio Audio] Error transcribiendo audio:", audioErr);
        const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Recibimos tu nota de voz en Kura CESFAM, pero hubo un problema técnico al procesarla. Por favor escríbenos brevemente si confirmas o necesitas reagendar tu hora.</Message></Response>`;
        res.status(200).type("text/xml").send(fallbackTwiml);
        return;
      }
    }

    if (!transcript) {
      const emptyTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola, somos el asistente virtual de Kura · CESFAM Providencia. Escríbenos o envíanos una nota de voz indicando si confirmas o deseas reagendar tu hora.</Message></Response>`;
      res.status(200).type("text/xml").send(emptyTwiml);
      return;
    }

    const patient = kuraStore.findPatientByPhone(fromRaw);
    const result = await kuraStore.analyzeAndRecordCommunication({
      patientId: patient.id,
      channel,
      transcript,
    });

    const rawReply =
      result.ok && result.communication?.suggestedReply
        ? result.communication.suggestedReply
        : "Gracias por comunicarte con Kura · CESFAM Providencia. Tu mensaje fue derivado al equipo SOME.";

    const replyText = rawReply.slice(0, 1500);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyText)}</Message></Response>`;
    res.status(200).type("text/xml").send(twiml);
  } catch (err) {
    console.error("[Kura Twilio Webhook] Error:", err);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Recibimos tu mensaje en Kura CESFAM. Un ejecutivo SOME lo revisará a la brevedad.</Message></Response>`;
    res.status(200).type("text/xml").send(errorTwiml);
  }
});

// Envío saliente real de WhatsApp vía Twilio
app.post("/api/whatsapp/send", async (req, res) => {
  try {
    const { to, message } = (req.body || {}) as { to?: unknown; message?: unknown };
    const phone = String(to || "").trim();
    const text = String(message || "").trim();
    if (!phone || !text) {
      res.status(400).json({ ok: false, error: "Debes indicar teléfono de destino y mensaje." });
      return;
    }
    const sent = await sendTwilioWhatsappMessage(phone, text);
    res.json({ ok: true, sid: sent.sid, status: sent.status });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Error enviando WhatsApp con Twilio",
    });
  }
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