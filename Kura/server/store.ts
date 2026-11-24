import pg from "pg";

export type StaffRole =
  | "ADMINISTRACIÓN SOME"
  | "ODONTOLOGÍA / BOX"
  | "COORDINACIÓN CLÍNICA"
  | "SOPORTE IOT / TÓTEM";

export interface StaffUser {
  id: number;
  email: string;
  password?: string;
  fullName: string;
  rut: string;
  role: StaffRole;
  unit: string;
  active: boolean;
  lastLoginAt: string;
}

export interface Patient {
  id: number;
  rut: string;
  rayenFicha: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string;
  sector: string;
  distanceKm: number;
  fonasaTramo: string;
  preferentialLaw: boolean;
  chronicProgram: string | null;
  totalAppointments: number;
  nspHistoryCount: number;
  isRealUserAdded?: boolean;
}

export interface Appointment {
  id: string;
  patientId: number;
  patient: Patient;
  specialty: string;
  boxNumber: string;
  professionalName: string;
  dayLabel: string;
  scheduledTime: string;
  status: string;
  channel: string;
  riskScore: number;
  riskReasons: string[];
  checkinAt?: string | null;
  checkinSource?: string | null;
  checkinLatencyMs?: number | null;
}

export interface WaitlistEntry {
  id: number;
  patientId: number;
  patient: Patient;
  specialty: string;
  priorityScore: number;
  clinicalNote: string;
  preferredShift: string;
  status: string;
  assignedAppointmentId: string | null;
}

export interface CommunicationItem {
  id: number;
  appointmentId: string | null;
  patientId: number;
  patientName: string;
  patientRut: string;
  channel: string;
  timeLabel: string;
  intent: string;
  transcript: string;
  rootCause: string | null;
  suggestedReply?: string | null;
  aiEngine?: string;
  vulnerabilityAlert: boolean;
  reviewStatus: string;
}

export interface IotEventItem {
  id: number;
  deviceId: string;
  hardwareType: string;
  qrRawPayload: string;
  rutExtracted: string;
  rutValidMod11: boolean;
  documentType: string;
  documentSerial: string;
  registryAuthority: string;
  patientName: string;
  appointmentId: string | null;
  latencyMs: number;
  offlineBuffered: boolean;
  status: string;
  createdAt: string;
}

export interface ConnectorItem {
  id: string;
  name: string;
  scope: string;
  endpointUrl: string;
  authToken: string;
  dbTarget: string;
  status: "Conectado" | "Sin configurar" | "En pruebas";
  lastCheckedAt: string;
}

export interface ParsedChileanId {
  rutDigits: string;
  rutFormatted: string;
  isValidMod11: boolean;
  documentType: string;
  documentSerial: string;
  registryAuthority: string;
}

export function normalizeRutDigits(raw: string): string {
  return raw.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatChileanRut(raw: string): string {
  const clean = normalizeRutDigits(raw);
  if (clean.length < 2) return raw.trim().toUpperCase();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

export function validateRutModulo11(raw: string): boolean {
  const clean = normalizeRutDigits(raw);
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return dv === expectedDv;
}

export function parseChileanIdQR(rawPayload: string): ParsedChileanId {
  const trimmed = rawPayload.trim();
  const isSidivUrl = /registrocivil\.cl/i.test(trimmed);

  let extractedRut = "";
  const urlRunMatch = trimmed.match(/RUN=([0-9]{6,8}-?[0-9kK])/i);
  if (urlRunMatch) {
    extractedRut = urlRunMatch[1];
  } else {
    const plainMatch = trimmed.match(/([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-?[0-9kK])/);
    extractedRut = plainMatch ? plainMatch[1] : trimmed;
  }

  const typeMatch = trimmed.match(/type=([A-Z0-9_]+)/i);
  const serialMatch = trimmed.match(/serial=([0-9A-Z]+)/i);

  const rutDigits = normalizeRutDigits(extractedRut);
  const rutFormatted = formatChileanRut(extractedRut);
  const isValidMod11 = validateRutModulo11(extractedRut);

  return {
    rutDigits,
    rutFormatted,
    isValidMod11,
    documentType: typeMatch ? typeMatch[1].toUpperCase() : isSidivUrl ? "CEDULA" : "RUT_DIRECTO",
    documentSerial: serialMatch ? serialMatch[1] : "No incluido en lectura",
    registryAuthority: isSidivUrl ? "Registro Civil SIDIV (QR Oficial)" : "Lectura directa / Ingreso manual",
  };
}

export function computeNspRiskScore(
  patient: Patient,
  appointment: Pick<Appointment, "status" | "dayLabel">,
  hasMobilityOrWorkBarrier: boolean,
): { riskScore: number; riskReasons: string[] } {
  const reasons: string[] = [];
  let logit = -1.55;

  const nspRatio =
    patient.totalAppointments > 0 ? patient.nspHistoryCount / patient.totalAppointments : 0.15;
  const pct = Math.round(nspRatio * 100);

  if (patient.totalAppointments === 0) {
    reasons.push("Paciente nuevo sin historial previo");
  } else if (pct >= 30) {
    logit += 3.35 * nspRatio;
    reasons.push(`${pct}% tasa histórica NSP (${patient.nspHistoryCount}/${patient.totalAppointments})`);
  } else if (pct > 0) {
    logit += 1.8 * nspRatio;
    reasons.push(`Baja tasa NSP (${pct}%)`);
  } else {
    logit -= 0.55;
    reasons.push("0% NSP histórico (adherente)");
  }

  if (patient.distanceKm >= 3.5) {
    logit += 0.25 * (patient.distanceKm - 1.5);
    reasons.push(`Distancia territorial ${patient.distanceKm.toFixed(1)} km`);
  }

  if (patient.preferentialLaw) {
    logit -= 0.22;
    reasons.push("Ley Preferente 20.584");
  }

  if (patient.age >= 70 && !hasMobilityOrWorkBarrier) {
    logit -= 0.2;
    reasons.push(`Adulto mayor (${patient.age} años)`);
  } else if (patient.age < 30) {
    logit += 0.28;
  }

  if (hasMobilityOrWorkBarrier) {
    logit += 1.25;
    reasons.push("Barrera reportada en canal omnicanal");
  }

  if (appointment.status === "Presente en sala") {
    logit -= 2.35;
    reasons.push("Acreditado presencialmente");
  } else if (appointment.status === "Confirmada" || appointment.status === "Reasignada") {
    logit -= 1.45;
    reasons.push("Asistencia confirmada");
  } else if (appointment.status === "Por confirmar") {
    logit += 0.45;
    reasons.push("Pendiente confirmación T-24h");
  }

  const probability = 1 / (1 + Math.exp(-logit));
  const riskScore = Math.round(Math.max(5, Math.min(96, probability * 100)));
  return { riskScore, riskReasons: reasons.slice(0, 3) };
}

function createInitialData() {
  // Cuentas institucionales del equipo CESFAM (modificables aquí o en prisma/seed.ts)
 const staffUsers: StaffUser[] = [
    { id: 1, email: "some@cesfam.cl", password: "cesfam2026", fullName: "Camila Valdés Rojas", rut: "17.845.210-3", role: "ADMINISTRACIÓN SOME", unit: "Ventanilla Central SOME · Providencia", active: true, lastLoginAt: "Hoy, 07:45" },
    { id: 2, email: "odontologia@cesfam.cl", password: "cesfam2026", fullName: "Dr. Sebastián Muñoz P.", rut: "15.290.441-8", role: "ODONTOLOGÍA / BOX", unit: "Unidad Dental · Box 3 y 4", active: true, lastLoginAt: "Hoy, 08:02" },
    { id: 3, email: "coordinacion@cesfam.cl", password: "cesfam2026", fullName: "Dra. Paulina Contreras M.", rut: "13.904.112-K", role: "COORDINACIÓN CLÍNICA", unit: "Dirección Técnica APS", active: true, lastLoginAt: "Ayer, 17:30" },
    { id: 4, email: "matias.munoz@cesfam.cl", password: "cesfam2026", fullName: "Matías Muñoz · Soporte TI", rut: "19.412.670-5", role: "SOPORTE IOT / TÓTEM", unit: "Infraestructura Digital & ESP32", active: true, lastLoginAt: "Hoy, 08:10" },
    { id: 5, email: "martin.riquelme@cesfam.cl", password: "cesfam2026", fullName: "Martín Riquelme", rut: "20.145.890-0", role: "SOPORTE IOT / TÓTEM", unit: "Soporte IoT & Telemetría ESP32", active: true, lastLoginAt: "Hoy, 08:15" },
    { id: 6, email: "alonso.sanchez@cesfam.cl", password: "cesfam2026", fullName: "Alonso Sánchez", rut: "20.489.312-8", role: "SOPORTE IOT / TÓTEM", unit: "Soporte IoT & Redes CESFAM", active: true, lastLoginAt: "Hoy, 08:18" },
    { id: 7, email: "nicole.moreno@cesfam.cl", password: "cesfam2026", fullName: "Nicole Moreno", rut: "20.763.419-0", role: "SOPORTE IOT / TÓTEM", unit: "Soporte Tótem SOME & Acreditación", active: true, lastLoginAt: "Hoy, 08:20" },
  ];

  const patients: Patient[] = [
    { id: 1, rut: "6.412.890-4", rayenFicha: "RYN-10421", fullName: "Rosa Elena Morales Soto", age: 74, gender: "F", phone: "+56 9 8412 3301", sector: "Sector Azul", distanceKm: 1.4, fonasaTramo: "B", preferentialLaw: true, chronicProgram: "Salud Oral Adulto Mayor", totalAppointments: 14, nspHistoryCount: 1 },
    { id: 2, rut: "15.432.890-K", rayenFicha: "RYN-20894", fullName: "Carlos Alberto Fuentes Vera", age: 42, gender: "M", phone: "+56 9 7621 9044", sector: "Sector Verde", distanceKm: 4.8, fonasaTramo: "C", preferentialLaw: false, chronicProgram: "Odontología Integral", totalAppointments: 9, nspHistoryCount: 4 },
    { id: 3, rut: "8.910.334-2", rayenFicha: "RYN-11902", fullName: "Héctor Manuel Tapia Díaz", age: 69, gender: "M", phone: "+56 9 6543 1189", sector: "Sector Azul", distanceKm: 2.1, fonasaTramo: "A", preferentialLaw: true, chronicProgram: "Cardiovascular + Dental", totalAppointments: 18, nspHistoryCount: 2 },
    { id: 4, rut: "18.234.567-1", rayenFicha: "RYN-33018", fullName: "Valentina Paz Rojas Lagos", age: 29, gender: "F", phone: "+56 9 9120 4455", sector: "Sector Rojo", distanceKm: 5.2, fonasaTramo: "D", preferentialLaw: false, chronicProgram: null, totalAppointments: 6, nspHistoryCount: 3 },
    { id: 5, rut: "7.320.118-9", rayenFicha: "RYN-14520", fullName: "Marta Eugenia Castro Pinto", age: 78, gender: "F", phone: "+56 9 5210 8874", sector: "Sector Verde", distanceKm: 3.9, fonasaTramo: "B", preferentialLaw: true, chronicProgram: "Movilidad Reducida", totalAppointments: 22, nspHistoryCount: 6 },
    { id: 6, rut: "16.789.012-5", rayenFicha: "RYN-28411", fullName: "Ignacio Andrés Soto Herrera", age: 36, gender: "M", phone: "+56 9 8877 6655", sector: "Sector Azul", distanceKm: 1.8, fonasaTramo: "C", preferentialLaw: false, chronicProgram: "Endodoncia", totalAppointments: 7, nspHistoryCount: 0 },
    { id: 7, rut: "12.456.789-0", rayenFicha: "RYN-19304", fullName: "Patricia Alejandra Silva Núñez", age: 53, gender: "F", phone: "+56 9 7412 9630", sector: "Sector Rojo", distanceKm: 2.7, fonasaTramo: "B", preferentialLaw: false, chronicProgram: "Periodoncia", totalAppointments: 11, nspHistoryCount: 1 },
    { id: 8, rut: "5.987.654-3", rayenFicha: "RYN-10089", fullName: "Luis Alberto González Reyes", age: 81, gender: "M", phone: "+56 9 6123 9980", sector: "Sector Azul", distanceKm: 1.1, fonasaTramo: "A", preferentialLaw: true, chronicProgram: "Prótesis Removible", totalAppointments: 25, nspHistoryCount: 1 },
    { id: 9, rut: "19.876.543-7", rayenFicha: "RYN-41209", fullName: "Fernanda Javiera Araya Ortiz", age: 24, gender: "F", phone: "+56 9 9456 3210", sector: "Sector Verde", distanceKm: 4.5, fonasaTramo: "B", preferentialLaw: false, chronicProgram: null, totalAppointments: 4, nspHistoryCount: 2 },
    { id: 10, rut: "14.111.222-6", rayenFicha: "RYN-24900", fullName: "Rodrigo Esteban Navarro Pino", age: 47, gender: "M", phone: "+56 9 8321 7740", sector: "Sector Rojo", distanceKm: 3.2, fonasaTramo: "C", preferentialLaw: false, chronicProgram: "Urgencia Odontológica", totalAppointments: 10, nspHistoryCount: 2 },
    { id: 11, rut: "11.223.344-5", rayenFicha: "RYN-17822", fullName: "Carmen Gloria Pérez Muñoz", age: 64, gender: "F", phone: "+56 9 7112 3344", sector: "Sector Azul", distanceKm: 1.9, fonasaTramo: "B", preferentialLaw: true, chronicProgram: "Salud Oral Adulto Mayor", totalAppointments: 16, nspHistoryCount: 1 },
    { id: 12, rut: "20.345.678-9", rayenFicha: "RYN-44102", fullName: "Matías Alejandro Díaz Soto", age: 22, gender: "M", phone: "+56 9 9887 1122", sector: "Sector Verde", distanceKm: 5.6, fonasaTramo: "C", preferentialLaw: false, chronicProgram: null, totalAppointments: 5, nspHistoryCount: 3 },
  ];

  const pById = Object.fromEntries(patients.map((p) => [p.id, p]));

  const appointments: Appointment[] = [
    { id: "RYN-2026-8841", patientId: 1, patient: pById[1], specialty: "Odontología General", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "08:30", status: "Presente en sala", channel: "Tótem QR", riskScore: 12, riskReasons: ["Acreditado presencialmente", "Ley Preferente 20.584"], checkinSource: "TOTEM_ESP32_QR", checkinAt: "08:22", checkinLatencyMs: 214 },
    { id: "RYN-2026-8842", patientId: 2, patient: pById[2], specialty: "Endodoncia", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "09:00", status: "Por confirmar", channel: "WhatsApp Bot", riskScore: 76, riskReasons: ["44% tasa histórica NSP (4/9)", "Distancia territorial 4.8 km", "Pendiente confirmación T-24h"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8843", patientId: 3, patient: pById[3], specialty: "Control Salud Oral", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Hoy", scheduledTime: "09:30", status: "Confirmada", channel: "Voz Telefónica", riskScore: 10, riskReasons: ["Asistencia confirmada", "Ley Preferente 20.584"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8844", patientId: 4, patient: pById[4], specialty: "Odontología General", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Hoy", scheduledTime: "10:00", status: "Por confirmar", channel: "Audio WhatsApp", riskScore: 86, riskReasons: ["50% tasa histórica NSP (3/6)", "Distancia territorial 5.2 km", "Barrera reportada en canal omnicanal"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8845", patientId: 5, patient: pById[5], specialty: "Prótesis Dental", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "10:30", status: "Cancelada", channel: "Audio WhatsApp", riskScore: 79, riskReasons: ["Barrera reportada en canal omnicanal", "Distancia territorial 3.9 km", "Ley Preferente 20.584"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8846", patientId: 6, patient: pById[6], specialty: "Endodoncia", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "11:00", status: "Confirmada", channel: "WhatsApp Bot", riskScore: 8, riskReasons: ["0% NSP histórico (adherente)", "Asistencia confirmada"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8847", patientId: 7, patient: pById[7], specialty: "Periodoncia", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Hoy", scheduledTime: "11:30", status: "Por confirmar", channel: "WhatsApp Bot", riskScore: 34, riskReasons: ["Baja tasa NSP (9%)", "Pendiente confirmación T-24h"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8848", patientId: 11, patient: pById[11], specialty: "Control Salud Oral", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "12:00", status: "Confirmada", channel: "Voz Telefónica", riskScore: 11, riskReasons: ["Ley Preferente 20.584", "Asistencia confirmada"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8849", patientId: 12, patient: pById[12], specialty: "Odontología General", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Mañana", scheduledTime: "08:30", status: "Por confirmar", channel: "WhatsApp Bot", riskScore: 85, riskReasons: ["60% tasa histórica NSP (3/5)", "Distancia territorial 5.6 km", "Pendiente confirmación T-24h"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
    { id: "RYN-2026-8850", patientId: 8, patient: pById[8], specialty: "Prótesis Removible", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Mañana", scheduledTime: "09:30", status: "Confirmada", channel: "Voz Telefónica", riskScore: 9, riskReasons: ["Adulto mayor (81 años)", "Asistencia confirmada"], checkinSource: null, checkinAt: null, checkinLatencyMs: null },
  ];

  const waitlist: WaitlistEntry[] = [
    { id: 1, patientId: 10, patient: pById[10], specialty: "Odontología / Prótesis", priorityScore: 94, clinicalNote: "Dolor agudo · Disponible en 15 min (Sector Rojo)", preferredShift: "Mañana", status: "Disponible", assignedAppointmentId: null },
    { id: 2, patientId: 9, patient: pById[9], specialty: "Odontología General", priorityScore: 86, clinicalNote: "Alta prioridad lista espera comunal", preferredShift: "Mañana", status: "Disponible", assignedAppointmentId: null },
    { id: 3, patientId: 8, patient: pById[8], specialty: "Prótesis Removible", priorityScore: 82, clinicalNote: "Ley Preferente 20.584 · Vive a 1.1 km", preferredShift: "Flexible", status: "Disponible", assignedAppointmentId: null },
  ];

  const communications: CommunicationItem[] = [
    { id: 1, appointmentId: "RYN-2026-8845", patientId: 5, patientName: pById[5].fullName, patientRut: pById[5].rut, channel: "Nota de Voz IA", timeLabel: "08:12", intent: "Cancela por movilidad", transcript: "«Buenos días mijita, hoy amanecí con mucho dolor en la rodilla y no tengo quién me acompañe al consultorio, por favor reagéndenme.»", rootCause: "Barrera de movilidad / transporte", suggestedReply: "Sra. Marta, lamentamos su molestia. Liberamos su cupo y activamos visita/reagendamiento asistido Ley Preferente.", aiEngine: "Motor NLP Clínico", vulnerabilityAlert: true, reviewStatus: "Pendiente" },
    { id: 2, appointmentId: "RYN-2026-8843", patientId: 3, patientName: pById[3].fullName, patientRut: pById[3].rut, channel: "Llamada Saliente", timeLabel: "07:55", intent: "Confirma asistencia", transcript: "Interacción IVR Voz: Paciente presiona opción 1 y confirma verbalmente asistencia a las 09:30 hrs.", rootCause: null, suggestedReply: "Muchas gracias Don Héctor, su hora a las 09:30 hrs en Box Dental 4 está confirmada.", aiEngine: "IVR Voz APS", vulnerabilityAlert: false, reviewStatus: "Revisado" },
    { id: 3, appointmentId: "RYN-2026-8844", patientId: 4, patientName: pById[4].fullName, patientRut: pById[4].rut, channel: "WhatsApp Texto", timeLabel: "08:28", intent: "Solicita reagendar", transcript: "«Hola, me cambiaron el turno en el trabajo justo a las 10, ¿se puede mover para la tarde o mañana?»", rootCause: "Incompatibilidad horaria laboral", suggestedReply: "Hola Valentina, recibimos tu solicitud de cambio por motivo laboral. Te contactaremos para ofrecer bloque vespertino.", aiEngine: "Motor NLP Clínico", vulnerabilityAlert: false, reviewStatus: "Pendiente" },
  ];

  const iotEvents: IotEventItem[] = [
    {
      id: 1,
      deviceId: "TOTEM-SOME-01",
      hardwareType: "ESP32-CAM · Lector QR Cédula",
      qrRawPayload: "https://portal.sidiv.registrocivil.cl/docstatus?RUN=6412890-4&type=CEDULA&serial=512894120",
      rutExtracted: "6.412.890-4",
      rutValidMod11: true,
      documentType: "CEDULA",
      documentSerial: "512894120",
      registryAuthority: "Registro Civil SIDIV (QR Oficial)",
      patientName: "Rosa Elena Morales Soto",
      appointmentId: "RYN-2026-8841",
      latencyMs: 214,
      offlineBuffered: false,
      status: "VALIDADO",
      createdAt: "08:22:14",
    },
  ];

  const connectors: ConnectorItem[] = [
    { id: "xgboost", name: "IA Predictiva · XGBoost (Colab)", scope: "Cálculo real de probabilidad NSP y factores clínicos", endpointUrl: process.env.XGBOOST_SERVICE_URL || "http://localhost:5000/api/ml/recalculate", authToken: "kura-ml-colab-2026", dbTarget: "Neon · kura_ia_predictiva", status: "Conectado", lastCheckedAt: "Motor activo" },
    { id: "voice_ai", name: "IA Conversacional · Google Gemini", scope: "Clasificación de intención y análisis de barreras sociales", endpointUrl: "https://generativelanguage.googleapis.com/v1beta", authToken: process.env.GEMINI_API_KEY || "", dbTarget: "Neon · kura_ia_contacto", status: process.env.GEMINI_API_KEY ? "Conectado" : "En pruebas", lastCheckedAt: process.env.GEMINI_API_KEY ? "Gemini API Key activa" : "NLP local (sin API Key aún)" },
    { id: "whatsapp", name: "WhatsApp Business API", scope: "Confirmación y cancelación bidireccional T-48h/T-24h", endpointUrl: "https://graph.facebook.com/v20.0/cesfam-providencia", authToken: "wa-meta-pilot-token", dbTarget: "Neon · kura_ia_contacto", status: "Conectado", lastCheckedAt: "Webhook listo" },
    { id: "rayen", name: "RCE · Rayen Salud / AVIS (Simulador)", scope: "Gestión de pacientes, fichas clínicas y agenda APS", endpointUrl: process.env.DATABASE_URL ? "Neon PostgreSQL Activo" : "neon://kura_panel_rayen/public", authToken: "rayen-sandbox-ro", dbTarget: "Neon · kura_panel_rayen", status: "Conectado", lastCheckedAt: "En línea" },
    { id: "esp32", name: "Tótem IoT · ESP32-CAM QR Cédula", scope: "Validación Módulo 11, Serie Cédula y anti-duplicado (< 500 ms)", endpointUrl: "/api/iot/checkin", authToken: process.env.IOT_DEVICE_TOKEN || "totem-some-providencia-2026", dbTarget: "Neon · kura_iot_totem", status: "Conectado", lastCheckedAt: "Idempotencia activa" },
  ];

  return {
    staffUsers,
    patients,
    appointments,
    waitlist,
    communications,
    iotEvents,
    connectors,
    mlModelVersion: "XGBoost-Kura-v1.3",
    mlLastCalculatedAt: "Hoy, 08:30",
  };
}

export class KuraStore {
  private state = createInitialData();
  private pgPool: pg.Pool | null = null;

  constructor() {
    if (process.env.DATABASE_URL) {
      try {
        this.pgPool = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
        });
      } catch {
        this.pgPool = null;
      }
    }
  }

  getGeminiApiKey(): string {
    const conn = this.state.connectors.find((c) => c.id === "voice_ai");
    const token = conn?.authToken?.trim() || "";
    if (token && token.startsWith("AIza")) return token;
    return (process.env.GEMINI_API_KEY || "").trim();
  }

  canViewSystemAdmin(role: string): boolean {
    return role === "SOPORTE IOT / TÓTEM" || role === "COORDINACIÓN CLÍNICA";
  }

  canEditSystemAdmin(role: string): boolean {
    return role === "SOPORTE IOT / TÓTEM";
  }

  getBootstrapData(requesterRole = "") {
    const todayAppts = this.state.appointments.filter((a) => a.dayLabel === "Hoy");
    const confirmedCount = todayAppts.filter(
      (a) => a.status === "Confirmada" || a.status === "Presente en sala" || a.status === "Reasignada",
    ).length;
    const pendingCount = todayAppts.filter((a) => a.status === "Por confirmar").length;
    const presentCount = todayAppts.filter((a) => a.status === "Presente en sala").length;
    const recoveredCount = todayAppts.filter((a) => a.status === "Reasignada").length;
    const availableWaitlist = this.state.waitlist.filter((w) => w.status === "Disponible").length;
    const avgLatency =
      this.state.iotEvents.length > 0
        ? Math.round(this.state.iotEvents.reduce((acc, e) => acc + e.latencyMs, 0) / this.state.iotEvents.length)
        : 214;

    const allowViewAdmin = !requesterRole || this.canViewSystemAdmin(requesterRole);
    const allowEditAdmin = this.canEditSystemAdmin(requesterRole);

    const visibleConnectors = allowViewAdmin
      ? this.state.connectors.map((c) => ({
          ...c,
          // Solo Soporte TI ve el token real; Coordinación Clínica en modo solo lectura ve token enmascarado
          authToken: allowEditAdmin ? c.authToken : c.authToken ? "••••••••••••" : "",
        }))
      : [];

    return {
      dbMode: this.pgPool ? "Neon PostgreSQL Conectado" : "Simulador Local + Datos Reales",
      aiConnected: Boolean(this.getGeminiApiKey()),
      aiEngineName: this.getGeminiApiKey() ? "Google Gemini 2.5 Flash (Conectado)" : "Motor NLP Clínico Local",
      mlModelVersion: this.state.mlModelVersion,
      mlLastCalculatedAt: this.state.mlLastCalculatedAt,
      kpis: {
        totalToday: todayAppts.length,
        confirmedCount,
        pendingCount,
        presentCount,
        recoveredCount,
        availableWaitlist,
        avgTotemLatencyMs: avgLatency,
        confirmationRate: todayAppts.length ? Math.round((confirmedCount / todayAppts.length) * 100) : 0,
      },
      patients: this.state.patients,
      appointments: this.state.appointments,
      waitlist: this.state.waitlist,
      communications: this.state.communications,
      iotEvents: this.state.iotEvents,
      connectors: visibleConnectors,
      staffUsers: this.state.staffUsers.map(({ password: _p, ...rest }) => rest),
    };
  }

  authenticate(email: string, password: string) {
    const found = this.state.staffUsers.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
    );
    if (!found) return null;
    found.lastLoginAt = "Ahora";
    const { password: _p, ...safeUser } = found;
    return safeUser;
  }

  createRealPatientAndAppointment(input: {
    fullName: string;
    rut: string;
    age: number;
    phone?: string;
    sector: string;
    distanceKm: number;
    fonasaTramo: string;
    preferentialLaw: boolean;
    totalAppointments: number;
    nspHistoryCount: number;
    specialty: string;
    professionalName: string;
    boxNumber: string;
    dayLabel: string;
    scheduledTime: string;
    status?: string;
  }) {
    const formattedRut = formatChileanRut(input.rut);
    const isValidMod11 = validateRutModulo11(formattedRut);
    if (!isValidMod11) {
      return { ok: false, error: `El RUT ${formattedRut} no supera la validación Módulo 11 de cédula chilena.` };
    }

    const digits = normalizeRutDigits(formattedRut);
    let patient = this.state.patients.find((p) => normalizeRutDigits(p.rut) === digits);

    if (!patient) {
      const nextId = this.state.patients.reduce((max, p) => Math.max(max, p.id), 0) + 1;
      patient = {
        id: nextId,
        rut: formattedRut,
        rayenFicha: `RYN-${50000 + nextId}`,
        fullName: input.fullName.trim(),
        age: Math.max(1, Math.min(115, Number(input.age) || 35)),
        gender: "N/E",
        phone: (input.phone || "+56 9 8000 0000").trim(),
        sector: input.sector || "Sector Azul",
        distanceKm: Math.max(0.2, Math.min(50, Number(input.distanceKm) || 2.0)),
        fonasaTramo: input.fonasaTramo || "B",
        preferentialLaw: Boolean(input.preferentialLaw),
        chronicProgram: "Ingreso Piloto Real",
        totalAppointments: Math.max(0, Number(input.totalAppointments) || 0),
        nspHistoryCount: Math.max(0, Math.min(Number(input.totalAppointments) || 0, Number(input.nspHistoryCount) || 0)),
        isRealUserAdded: true,
      };
      this.state.patients.unshift(patient);
    }

    const apptNum = 8851 + this.state.appointments.length;
    const status = input.status || "Por confirmar";
    const risk = computeNspRiskScore(patient, { status, dayLabel: input.dayLabel || "Hoy" }, false);

    const newAppt: Appointment = {
      id: `RYN-2026-${apptNum}`,
      patientId: patient.id,
      patient,
      specialty: input.specialty || "Odontología General",
      professionalName: input.professionalName || "Dr. Sebastián Muñoz P.",
      boxNumber: input.boxNumber || "Box Dental 3",
      dayLabel: input.dayLabel || "Hoy",
      scheduledTime: input.scheduledTime || "12:30",
      status,
      channel: "Ingreso Real SOME",
      riskScore: risk.riskScore,
      riskReasons: risk.riskReasons,
      checkinSource: null,
      checkinAt: null,
      checkinLatencyMs: null,
    };

    this.state.appointments.unshift(newAppt);
    return { ok: true, appointment: newAppt, patient };
  }

  recalculateAllRisks(modelVersion?: string) {
    if (modelVersion) {
      this.state.mlModelVersion = modelVersion.slice(0, 60);
    }
    this.state.mlLastCalculatedAt = `Hoy, ${new Date().toTimeString().slice(0, 5)}`;

    for (const appt of this.state.appointments) {
      const hasBarrier = this.state.communications.some(
        (c) => c.patientId === appt.patientId && Boolean(c.rootCause),
      );
      const { riskScore, riskReasons } = computeNspRiskScore(appt.patient, appt, hasBarrier);
      appt.riskScore = riskScore;
      appt.riskReasons = riskReasons;
    }

    return {
      updated: this.state.appointments.length,
      modelVersion: this.state.mlModelVersion,
      calculatedAt: this.state.mlLastCalculatedAt,
    };
  }

  manualCheckin(appointmentId: string, source: "MANUAL_SOME_DESK" | "TOTEM_ESP32_QR" = "MANUAL_SOME_DESK", latencyMs = 45) {
    const appt = this.state.appointments.find((a) => a.id === appointmentId);
    if (!appt) return null;
    const hhmm = new Date().toTimeString().slice(0, 5);
    appt.status = "Presente en sala";
    appt.channel = source === "TOTEM_ESP32_QR" ? "Tótem QR" : "Mesón SOME (Manual)";
    appt.checkinSource = source;
    appt.checkinAt = hhmm;
    appt.checkinLatencyMs = latencyMs;
    const risk = computeNspRiskScore(appt.patient, appt, false);
    appt.riskScore = risk.riskScore;
    appt.riskReasons = risk.riskReasons;
    return appt;
  }

  checkinByRutOrQR(rawPayload: string, deviceId = "TOTEM-SOME-01", hardwareType = "ESP32-CAM · Lector QR Cédula", offlineBuffered = false, measuredMs = 195) {
    const parsed = parseChileanIdQR(rawPayload);
    if (!parsed.rutDigits || parsed.rutDigits.length < 7 || !parsed.isValidMod11) {
      return {
        ok: false,
        parsed,
        error: `Lectura rechazada: el RUT "${parsed.rutFormatted}" no cumple el Dígito Verificador Módulo 11 de la cédula chilena.`,
      };
    }

    const appt = this.state.appointments.find(
      (a) => a.dayLabel === "Hoy" && normalizeRutDigits(a.patient.rut) === parsed.rutDigits,
    );

    const patient = this.state.patients.find((p) => normalizeRutDigits(p.rut) === parsed.rutDigits);
    const nowStr = new Date().toTimeString().slice(0, 8);

    if (appt && appt.status === "Presente en sala") {
      return {
        ok: true,
        alreadyCheckedIn: true,
        latencyMs: measuredMs,
        parsed,
        displayMessage: `${appt.patient.fullName} (RUT ${parsed.rutFormatted}) ya fue acreditado a las ${appt.checkinAt || "08:30"} hrs en ${appt.boxNumber}.`,
        appointment: appt,
      };
    }

    const eventRecord: IotEventItem = {
      id: this.state.iotEvents.length + 1,
      deviceId: deviceId.slice(0, 40),
      hardwareType: hardwareType.slice(0, 60),
      qrRawPayload: rawPayload.slice(0, 240),
      rutExtracted: parsed.rutFormatted,
      rutValidMod11: parsed.isValidMod11,
      documentType: parsed.documentType,
      documentSerial: parsed.documentSerial,
      registryAuthority: parsed.registryAuthority,
      patientName: patient ? patient.fullName : "Cédula válida sin hora agendada hoy",
      appointmentId: appt ? appt.id : null,
      latencyMs: measuredMs,
      offlineBuffered,
      status: appt ? "VALIDADO" : "SIN_CITA_HOY",
      createdAt: nowStr,
    };
    this.state.iotEvents.unshift(eventRecord);

    if (!appt) {
      return {
        ok: false,
        parsed,
        rut: parsed.rutFormatted,
        message: `Cédula verificada (${parsed.rutFormatted} · Módulo 11 OK), pero no registra hora agendada para hoy. Acérquese al mesón SOME.`,
        event: eventRecord,
      };
    }

    this.manualCheckin(appt.id, "TOTEM_ESP32_QR", measuredMs);

    return {
      ok: true,
      alreadyCheckedIn: false,
      latencyMs: measuredMs,
      parsed,
      displayMessage: `Cédula validada (${parsed.rutFormatted} · Serie ${parsed.documentSerial}): ${appt.patient.fullName} → ${appt.boxNumber} (${appt.scheduledTime} hrs).`,
      appointment: appt,
      event: eventRecord,
    };
  }

  updateAppointmentStatus(appointmentId: string, status: string, channel?: string) {
    const appt = this.state.appointments.find((a) => a.id === appointmentId);
    if (!appt) return null;
    appt.status = status;
    if (channel) appt.channel = channel;
    const risk = computeNspRiskScore(appt.patient, appt, false);
    appt.riskScore = risk.riskScore;
    appt.riskReasons = risk.riskReasons;
    return appt;
  }

  executeSlotFilling(appointmentId: string, waitlistId?: number) {
    const appt = this.state.appointments.find((a) => a.id === appointmentId);
    if (!appt) return { ok: false, error: "Cita no encontrada." };

    const candidate = waitlistId
      ? this.state.waitlist.find((w) => w.id === waitlistId && w.status === "Disponible")
      : this.state.waitlist.find((w) => w.status === "Disponible");

    if (!candidate) {
      return { ok: false, error: "No hay pacientes disponibles en la lista de espera priorizada." };
    }

    candidate.status = "Asignado";
    candidate.assignedAppointmentId = appt.id;

    appt.patientId = candidate.patientId;
    appt.patient = candidate.patient;
    appt.status = "Reasignada";
    appt.channel = "Slot-Filling Exprés";
    const risk = computeNspRiskScore(appt.patient, appt, false);
    appt.riskScore = risk.riskScore;
    appt.riskReasons = ["Cupo recuperado vía lista de espera", ...risk.riskReasons.slice(0, 2)];

    return { ok: true, appointment: appt, waitlistEntry: candidate };
  }

  async analyzeAndRecordCommunication(input: {
    patientId: number;
    channel: string;
    transcript: string;
  }) {
    const patient = this.state.patients.find((p) => p.id === input.patientId);
    if (!patient) {
      return { ok: false, error: "Paciente no encontrado." };
    }

    const appt = this.state.appointments.find(
      (a) => a.patientId === patient.id && (a.dayLabel === "Hoy" || a.dayLabel === "Mañana"),
    );

    const text = input.transcript.trim();
    const apiKey = this.getGeminiApiKey();

    let intent = "Consulta administrativa";
    let rootCause: string | null = null;
    let vulnerabilityAlert = false;
    let suggestedReply = `Hola ${patient.fullName.split(" ")[0]}, recibimos tu mensaje en Kura · CESFAM Providencia. Un ejecutivo SOME revisará tu solicitud.`;
    let aiEngine = "Motor NLP Clínico Local";

    if (apiKey) {
      try {
        const prompt = `Eres el asistente de IA clínica omnicanal Kura de un CESFAM en Chile. Analiza este mensaje de un paciente (${patient.fullName}, edad ${patient.age} años, Ley Preferente 20.584: ${patient.preferentialLaw ? "Sí" : "No"}) y responde ÚNICAMENTE un JSON válido con las claves:
- "intent": uno exacto entre ["Confirma asistencia", "Cancela por movilidad", "Solicita reagendar", "Consulta administrativa"]
- "rootCause": string breve explicando la barrera si cancela o reagenda (ej. "Barrera de movilidad / transporte", "Incompatibilidad horaria laboral") o null si confirma
- "vulnerabilityAlert": boolean (true si es adulto mayor o Ley Preferente y reporta dolor, dificultad de movilidad o falta de acompañante)
- "suggestedReply": respuesta breve, empática y formal en español chileno para enviar al paciente.

Mensaje del paciente: "${text}"`;

        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
            }),
          },
        );

        if (geminiResp.ok) {
          const geminiData = (await geminiResp.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const rawJson = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const parsed = JSON.parse(rawJson) as {
            intent?: string;
            rootCause?: string | null;
            vulnerabilityAlert?: boolean;
            suggestedReply?: string;
          };
          if (parsed.intent) intent = parsed.intent;
          rootCause = parsed.rootCause ?? null;
          vulnerabilityAlert = Boolean(parsed.vulnerabilityAlert);
          if (parsed.suggestedReply) suggestedReply = parsed.suggestedReply;
          aiEngine = "Google Gemini 2.5 Flash (API Real)";
        }
      } catch {
        // Fallback to local NLP below
      }
    }

    if (aiEngine === "Motor NLP Clínico Local") {
      const lower = text.toLowerCase();
      if (/(no puedo ir|cancela|dolor|rodilla|caminar|locomoci|acompañ|enferm|hospital)/.test(lower)) {
        intent = "Cancela por movilidad";
        rootCause = "Barrera de movilidad / salud aguda";
        vulnerabilityAlert = patient.preferentialLaw || patient.age >= 65;
        suggestedReply = `Estimado/a ${patient.fullName.split(" ")[0]}, hemos liberado su cupo para evitar inasistencia y activamos seguimiento prioritario SOME.`;
      } else if (/(reagend|cambiar|mover|turno|trabajo|otro d[ií]a|m[aá]s tarde)/.test(lower)) {
        intent = "Solicita reagendar";
        rootCause = "Incompatibilidad horaria / laboral";
        vulnerabilityAlert = false;
        suggestedReply = `Hola ${patient.fullName.split(" ")[0]}, registramos tu solicitud de cambio de bloque. El equipo SOME te contactará a la brevedad.`;
      } else if (/(confirmo|s[ií],? voy|asistir[eé]|all[aá] estar[eé]|opci[oó]n 1|ok voy|presente)/.test(lower)) {
        intent = "Confirma asistencia";
        rootCause = null;
        vulnerabilityAlert = false;
        suggestedReply = `Gracias ${patient.fullName.split(" ")[0]}, tu cita ${appt ? `de las ${appt.scheduledTime} hrs en ${appt.boxNumber}` : ""} ha quedado confirmada.`;
      }
    }

    if (appt) {
      if (intent === "Confirma asistencia" && appt.status === "Por confirmar") {
        appt.status = "Confirmada";
        appt.channel = input.channel;
      } else if (intent === "Cancela por movilidad" && appt.status !== "Presente en sala") {
        appt.status = "Cancelada";
        appt.channel = input.channel;
      }
      const risk = computeNspRiskScore(patient, appt, Boolean(rootCause));
      appt.riskScore = risk.riskScore;
      appt.riskReasons = risk.riskReasons;
    }

    const newComm: CommunicationItem = {
      id: this.state.communications.length + 1,
      appointmentId: appt ? appt.id : null,
      patientId: patient.id,
      patientName: patient.fullName,
      patientRut: patient.rut,
      channel: input.channel,
      timeLabel: new Date().toTimeString().slice(0, 5),
      intent,
      transcript: text,
      rootCause,
      suggestedReply,
      aiEngine,
      vulnerabilityAlert,
      reviewStatus: intent === "Confirma asistencia" ? "Revisado" : "Pendiente",
    };

    this.state.communications.unshift(newComm);
    return { ok: true, communication: newComm, appointmentUpdated: appt || null };
  }

  markCommunicationReviewed(id: number) {
    const item = this.state.communications.find((c) => c.id === id);
    if (!item) return null;
    item.reviewStatus = "Revisado";
    return item;
  }

  updateConnector(id: string, data: Partial<ConnectorItem>) {
    const conn = this.state.connectors.find((c) => c.id === id);
    if (!conn) return null;
    if (typeof data.endpointUrl === "string") conn.endpointUrl = data.endpointUrl.slice(0, 250);
    if (typeof data.authToken === "string") conn.authToken = data.authToken.slice(0, 250);
    if (typeof data.dbTarget === "string") conn.dbTarget = data.dbTarget.slice(0, 100);
    if (data.status === "Conectado" || data.status === "Sin configurar" || data.status === "En pruebas") {
      conn.status = data.status;
    }
    conn.lastCheckedAt = "Actualizado ahora";
    return conn;
  }

  resetDemo() {
    this.state = createInitialData();
    return this.getBootstrapData("SOPORTE IOT / TÓTEM");
  }
}

export const kuraStore = new KuraStore();
