//server/app.ts
import express from "express";
import cors from "cors";
import { kuraStore } from "./store.js";

const app = express();

const allowedOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const processedTwilioSids = new Set<string>();
let cachedTwilioContentSid: string | null = null;

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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getCleanTwilioCreds(fallbackSid = "") {
  const sid = (process.env.TWILIO_ACCOUNT_SID || fallbackSid || "").replace(/[^a-zA-Z0-9]/g, "");
  const token = (process.env.TWILIO_AUTH_TOKEN || "").replace(/[^a-zA-Z0-9]/g, "");
  const fromRaw = (process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+17372508034").trim();
  const envContentSid = (process.env.TWILIO_CONTENT_SID || "").replace(/[^a-zA-Z0-9]/g, "");
  return { sid, token, fromRaw, envContentSid };
}

async function resolveTwilioContentSid(sid: string, token: string, envContentSid: string): Promise<string | null> {
  if (envContentSid.startsWith("HX")) return envContentSid;
  if (cachedTwilioContentSid) return cachedTwilioContentSid;

  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const resp = await fetch("https://content.twilio.com/v1/Content?PageSize=20", {
    headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });

  if (!resp.ok) {
    return null;
  }

  const data = (await resp.json()) as {
    contents?: Array<{ sid?: string; friendly_name?: string }>;
  };
  const list = data.contents || [];
  const preferred =
    list.find((c) => /appointment|cita|reminder/i.test(String(c.friendly_name || ""))) || list[0];

  if (preferred?.sid) {
    cachedTwilioContentSid = preferred.sid;
    return preferred.sid;
  }
  return null;
}

function buildContentVariablesFromMessage(messageBody: string): string {
  const clean = messageBody.replace(/\s+/g, " ").trim();
  const dayMatch = clean.match(/para\s+(.+?)\s+en\s+el\s+bloque/i);
  const blockMatch = clean.match(/bloque\s+([0-9]{2}:[0-9]{2}\s*-\s*[0-9]{2}:[0-9]{2})/i);
  const boxMatch = clean.match(/\((Box[^)]+)\)/i);

  const var1 = dayMatch?.[1]
    ? `${dayMatch[1]} · CESFAM Providencia`
    : "CESFAM Providencia (Kura)";
  const var2 = blockMatch?.[1]
    ? `${blockMatch[1]} hrs${boxMatch?.[1] ? ` (${boxMatch[1]})` : ""}`
    : clean.slice(0, 110);

  return JSON.stringify({
    "1": var1.slice(0, 120),
    "2": var2.slice(0, 120),
  });
}

async function downloadTwilioMedia(mediaUrl: string, webhookAccountSid = ""): Promise<Buffer> {
  const { sid, token } = getCleanTwilioCreds(webhookAccountSid);

  const fetchMedia = async (targetUrl: string, useAuth: boolean): Promise<Buffer> => {
    const headers: Record<string, string> = { Accept: "*/*" };
    if (useAuth && sid && token) {
      headers.Authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
    }

    const firstRes = await fetch(targetUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    if (firstRes.status >= 300 && firstRes.status < 400) {
      const redirectLocation = firstRes.headers.get("location");
      if (!redirectLocation) {
        throw new Error(`Redirección sin destino desde Twilio (${firstRes.status})`);
      }
      const cdnRes = await fetch(redirectLocation, {
        headers: { Accept: "*/*" },
        signal: AbortSignal.timeout(5000),
      });
      if (!cdnRes.ok) {
        throw new Error(`Error descargando audio desde CDN Twilio (${cdnRes.status})`);
      }
      return Buffer.from(await cdnRes.arrayBuffer());
    }

    if (!firstRes.ok) {
      const detail = await firstRes.text().catch(() => "");
      const err = new Error(
        `Twilio Media HTTP ${firstRes.status}: ${detail.slice(0, 120)}`,
      ) as Error & { status?: number };
      err.status = firstRes.status;
      throw err;
    }

    return Buffer.from(await firstRes.arrayBuffer());
  };

  try {
    return await fetchMedia(mediaUrl, Boolean(sid && token));
  } catch (firstErr) {
    const status = (firstErr as { status?: number })?.status;
    if ((status === 401 || status === 403) && sid && token) {
      const normalizedAccountUrl = mediaUrl.replace(/\/Accounts\/AC[a-zA-Z0-9]+\//, `/Accounts/${sid}/`);
      if (normalizedAccountUrl !== mediaUrl) {
        try {
          return await fetchMedia(normalizedAccountUrl, true);
        } catch {
          // continúa al intento sin cabecera
        }
      }
      return await fetchMedia(mediaUrl, false);
    }
    throw firstErr;
  }
}

function isOutside24hWindowError(code: unknown, message?: unknown): boolean {
  if (Number(code) === 63016) return true;
  const text = String(message || "");
  return /63016|ContentSid|outside the allowed window|24[\s-]?hour/i.test(text);
}

function formatWhatsAppAddress(raw: string): string {
  const withoutPrefix = raw.trim().replace(/^whatsapp:/i, "");
  const cleanDigits = withoutPrefix.replace(/[^\d+]/g, "");
  const normalized = cleanDigits.startsWith("+") ? cleanDigits : `+${cleanDigits}`;
  return `whatsapp:${normalized}`;
}

async function checkTwilioMessageDelivery(
  sid: string,
  basicAuth: string,
  messageSid: string,
): Promise<{ status?: string; error_code?: number | null; error_message?: string | null } | null> {
  const statusUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`;
  const delaysMs = [1200, 1200];

  for (const ms of delaysMs) {
    await new Promise((resolve) => setTimeout(resolve, ms));

    const resp = await fetch(statusUrl, {
      headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      status?: string;
      error_code?: number | null;
      error_message?: string | null;
    };

    const st = String(data.status || "").toLowerCase();
    if (st === "failed" || st === "undelivered" || st === "sent" || st === "delivered" || st === "read") {
      return data;
    }
  }

  return null;
}

async function sendTwilioWhatsappMessage(toPhone: string, messageBody: string) {
  const { sid, token, fromRaw, envContentSid } = getCleanTwilioCreds();

  if (!sid || !token) {
    throw new Error("Credenciales de Twilio no configuradas en el servidor.");
  }

  const formattedTo = formatWhatsAppAddress(toPhone);
  const formattedFrom = formatWhatsAppAddress(fromRaw);
  const basicAuth = Buffer.from(`${sid}:${token}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  // 1) PRIMER INTENTO: Texto libre en español (sin ContentSid)
  const freeformParams = new URLSearchParams();
  freeformParams.append("To", formattedTo);
  freeformParams.append("From", formattedFrom);
  freeformParams.append("Body", messageBody.slice(0, 1500));

  const firstResp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: freeformParams.toString(),
    signal: AbortSignal.timeout(8000),
  });

  const firstData = (await firstResp.json()) as {
    sid?: string;
    message?: string;
    status?: string;
    code?: number;
    error_code?: number | null;
    error_message?: string | null;
  };

  let needsTemplateFallback = false;

  if (!firstResp.ok) {
    if (isOutside24hWindowError(firstData.code ?? firstData.error_code, firstData.message)) {
      needsTemplateFallback = true;
    } else {
      throw new Error(firstData.message || `Error Twilio API (${firstResp.status})`);
    }
  } else if (firstData.sid) {
    // Verifica rechazo asíncrono (Twilio acepta como "queued" y falla con 63016 ~1s después)
    const delivery = await checkTwilioMessageDelivery(sid, basicAuth, firstData.sid);
    const deliveryStatus = String(delivery?.status || "").toLowerCase();

    if (deliveryStatus === "failed" || deliveryStatus === "undelivered") {
      if (isOutside24hWindowError(delivery?.error_code, delivery?.error_message)) {
        needsTemplateFallback = true;
      } else {
        const errCode = delivery?.error_code ?? "sin código";
        const errDetail = delivery?.error_message || "No entregado por WhatsApp.";
        throw new Error(`Twilio rechazó el mensaje (${errCode}): ${errDetail}`);
      }
    } else {
      return {
        ...firstData,
        status: delivery?.status || firstData.status,
        deliveryMode: "freeform_es" as const,
        usedFallbackTemplate: false,
      };
    }
  }

  if (!needsTemplateFallback) {
    return {
      ...firstData,
      deliveryMode: "freeform_es" as const,
      usedFallbackTemplate: false,
    };
  }

  // 2) RESPALDO: Solo si la ventana de 24h está cerrada (error 63016)
  const contentSid = await resolveTwilioContentSid(sid, token, envContentSid);
  if (!contentSid) {
    throw new Error(
      "La ventana de 24 horas de WhatsApp está cerrada (63016) y no hay TWILIO_CONTENT_SID configurado en Vercel.",
    );
  }

  const templateParams = new URLSearchParams();
  templateParams.append("To", formattedTo);
  templateParams.append("From", formattedFrom);
  templateParams.append("ContentSid", contentSid);
  templateParams.append("ContentVariables", buildContentVariablesFromMessage(messageBody));

  const tplResp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: templateParams.toString(),
    signal: AbortSignal.timeout(8000),
  });

  const tplData = (await tplResp.json()) as { sid?: string; message?: string; status?: string };
  if (!tplResp.ok) {
    throw new Error(tplData.message || `Error Twilio Content Template (${tplResp.status})`);
  }

  return {
    ...tplData,
    deliveryMode: "template_fallback" as const,
    usedFallbackTemplate: true,
  };
}

app.use("/api", async (req, res, next) => {
  await kuraStore.ensureReady();
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const originalSend = res.send.bind(res);
    let persisted = false;
    res.send = ((body?: unknown) => {
      if (!persisted && !res.locals.alreadyPersisted && res.statusCode < 400) {
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
  const { sid, token } = getCleanTwilioCreds();
  res.json({
    status: "ok",
    service: "Kura API",
    aiConnected: Boolean(kuraStore.getGeminiApiKey()),
    twilioConnected: Boolean(sid.length === 34 && token.length === 32),
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

app.post("/api/ml/recalculate", async (req, res) => {
  const { modelVersion } = (req.body || {}) as { modelVersion?: string };
  const summary = await kuraStore.recalculateAllRisksWithModel(modelVersion);
  res.json({ ok: true, ...summary });
});

app.post("/api/ml/sync", async (req, res) => {
  const { modelVersion } = (req.body || {}) as { modelVersion?: string };
  const summary = await kuraStore.recalculateAllRisksWithModel(modelVersion);
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

// Webhook entrante de WhatsApp (Twilio: texto y notas de voz -> respuesta libre de Gemini vía TwiML)
app.post("/api/webhooks/twilio", async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const messageSid = String(body.MessageSid || body.SmsMessageSid || "").trim();
  const webhookAccountSid = String(body.AccountSid || "").trim();
  const fromRaw = String(body.From || "").trim();
  const textBody = String(body.Body || "").trim();
  const numMedia = Number(body.NumMedia || 0);
  const mediaUrl0 = String(body.MediaUrl0 || "").trim();
  const mediaType0 = String(body.MediaContentType0 || "audio/ogg").trim();

  try {
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
    const isAudio =
      numMedia > 0 &&
      Boolean(mediaUrl0) &&
      (mediaType0.startsWith("audio/") || mediaType0.includes("ogg") || mediaType0.includes("opus"));

    if (isAudio) {
      channel = "Nota de Voz WhatsApp";
      try {
        const audioBuffer = await downloadTwilioMedia(mediaUrl0, webhookAccountSid);
        const transcribed = await kuraStore.transcribeAudioBuffer(audioBuffer, mediaType0);
        transcript = textBody ? `${transcribed} (${textBody})` : transcribed;
      } catch (audioErr) {
        console.warn("[Kura Twilio Audio] Fallback sin descarga de media:", (audioErr as Error)?.message);
        transcript =
          textBody ||
          "[Nota de voz recibida por WhatsApp — paciente solicita gestión de su cita]";
      }
    }

    if (!transcript) {
      const welcomeTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola, somos el asistente virtual de Kura · CESFAM Providencia. Escríbenos o envíanos una nota de voz indicando si confirmas o deseas reagendar tu hora.</Message></Response>`;
      res.status(200).type("text/xml").send(welcomeTwiml);
      return;
    }

    const patient = kuraStore.findPatientByPhone(fromRaw);
    const result = await kuraStore.analyzeAndRecordCommunication({
      patientId: patient.id,
      channel,
      transcript,
    });

    // Actualiza automáticamente la cita del paciente según su respuesta
    const intentLower = String(result.communication?.intent || "").toLowerCase();
    const transcriptLower = transcript.toLowerCase();
    const snapshot = kuraStore.getBootstrapData("SOPORTE IOT / TÓTEM");
    const targetAppt =
      snapshot.appointments.find(
        (a) => a.patientId === patient.id && a.status !== "Presente en sala" && a.status !== "Cancelada",
      ) || snapshot.appointments.find((a) => a.patientId === patient.id);

    if (targetAppt && targetAppt.status !== "Presente en sala") {
      if (
        intentLower.includes("cancel") ||
        transcriptLower.includes("no puedo") ||
        transcriptLower.includes("no podré") ||
        transcriptLower.includes("cancel")
      ) {
        kuraStore.updateAppointmentStatus(targetAppt.id, "Cancelada");
      } else if (
        intentLower.includes("confirm") ||
        transcriptLower.includes("confirm") ||
        transcriptLower.includes("asistir") ||
        transcriptLower.includes("voy") ||
        /^c$/i.test(transcript.trim())
      ) {
        kuraStore.updateAppointmentStatus(targetAppt.id, "Confirmada", "WhatsApp Twilio");
      }
    }

    await kuraStore.persistToNeon();
    res.locals.alreadyPersisted = true;

    const rawReply =
      result.ok && result.communication?.suggestedReply
        ? result.communication.suggestedReply
        : `Hola ${patient.fullName.split(" ")[0]}, recibimos tu mensaje en Kura · CESFAM Providencia. Tu solicitud fue registrada por el equipo SOME.`;

    // Respuesta directa TwiML: permite texto libre personalizado en español en Twilio Trial
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(rawReply.slice(0, 1500))}</Message></Response>`;
    res.status(200).type("text/xml").send(twiml);
  } catch (err) {
    console.error("[Kura Twilio Webhook] Error:", err);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Recibimos tu mensaje en Kura · CESFAM Providencia. Un ejecutivo SOME lo revisará a la brevedad.</Message></Response>`;
    res.status(200).type("text/xml").send(fallbackTwiml);
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
    res.json({
      ok: true,
      sid: sent.sid,
      status: sent.status,
      deliveryMode: sent.deliveryMode,
      usedFallbackTemplate: sent.usedFallbackTemplate,
    });
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