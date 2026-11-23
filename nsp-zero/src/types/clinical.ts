export type StaffRole =
  | "ADMINISTRACIÓN SOME"
  | "ODONTOLOGÍA / BOX"
  | "COORDINACIÓN CLÍNICA"
  | "SOPORTE IOT / TÓTEM";

export interface StaffUser {
  id: number;
  email: string;
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
  professionalName: string;
  boxNumber: string;
  dayLabel: string;
  scheduledTime: string;
  status: string;
  channel: string;
  riskScore: number;
  riskReasons: string[];
  checkinSource: string | null;
  checkinAt: string | null;
  checkinLatencyMs: number | null;
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

export interface BootstrapPayload {
  dbMode: string;
  aiConnected: boolean;
  aiEngineName: string;
  mlModelVersion: string;
  mlLastCalculatedAt: string;
  kpis: {
    totalToday: number;
    confirmedCount: number;
    pendingCount: number;
    presentCount: number;
    recoveredCount: number;
    availableWaitlist: number;
    avgTotemLatencyMs: number;
    confirmationRate: number;
  };
  patients: Patient[];
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  communications: CommunicationItem[];
  iotEvents: IotEventItem[];
  connectors: ConnectorItem[];
  staffUsers: StaffUser[];
}
