// src/pages/PortalPage.tsx
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, CalendarDays, Camera, CheckCircle2,
  ChevronRight, CircleCheck, ClipboardCheck, Clock3, Cpu, Eye, FileText,
  Headphones, KeyRound, LayoutDashboard, Lock, LogOut, MessagesSquare,
  MoreHorizontal, Phone, PlugZap, Plus, QrCode, Radio, RefreshCw,
  ScanLine, Search, Send, Settings2, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, UserCheck, UserPlus, UsersRound, X, Zap,
} from "lucide-react";
import type {
  Appointment, BootstrapPayload, CommunicationItem,
  ConnectorItem, IotEventItem, Patient, StaffUser, WaitlistEntry,
} from "../types/clinical";

interface PortalPageProps {
  user: StaffUser;
  onLogout: () => void;
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const SPECIALTY_BLOCK_MINUTES: Record<string, number> = {
  "Odontología General": 30,
  "Urgencia Dental / Evaluación": 30,
  "Control Salud Oral": 30,
  "Operatoria / Destartraje": 30,
  "Periodoncia": 30,
  "Odontopediatría": 30,
  "Endodoncia": 45,
  "Prótesis Dental": 45,
  "Cirugía Bucal / Exodoncia Compleja": 60,
  "Endodoncia Molar Compleja": 60,
};

function getWeeklyDays(): { value: string; label: string }[] {
  const base = new Date();
  const list: { value: string; label: string }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dayName = DIAS_SEMANA[d.getDay()];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");

    if (i === 0) {
      list.push({ value: "Hoy", label: `Hoy (${dayName} ${dd}/${mm})` });
    } else if (i === 1) {
      list.push({ value: "Mañana", label: `Mañana (${dayName} ${dd}/${mm})` });
    } else {
      list.push({ value: `${dayName} ${dd}/${mm}`, label: `${dayName} ${dd}/${mm}` });
    }
  }
  return list;
}

function getBlocksForSpecialty(specialty: string): { value: string; label: string; duration: number }[] {
  const duration = SPECIALTY_BLOCK_MINUTES[specialty] ?? 30;
  const blocks: { value: string; label: string; duration: number }[] = [];
  const startMin = 8 * 60; // 08:00
  const endMin = 17 * 60;  // 17:00

  for (let m = startMin; m + duration <= endMin; m += duration) {
    const h1 = String(Math.floor(m / 60)).padStart(2, "0");
    const min1 = String(m % 60).padStart(2, "0");
    const end = m + duration;
    const h2 = String(Math.floor(end / 60)).padStart(2, "0");
    const min2 = String(end % 60).padStart(2, "0");

    const range = `${h1}:${min1} - ${h2}:${min2}`;
    blocks.push({
      value: range,
      label: `${range} (${duration} min)`,
      duration,
    });
  }
  return blocks;
}

const allNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard, adminOnly: false },
  { href: "/appointments", label: "Agenda y espera", icon: CalendarDays, adminOnly: false },
  { href: "/risk", label: "Revisión de riesgo", icon: ShieldAlert, adminOnly: false },
  { href: "/communications", label: "Comunicaciones", icon: MessagesSquare, adminOnly: false },
  { href: "/kiosk", label: "Tótem SOME", icon: ScanLine, adminOnly: false },
  { href: "/staff", label: "Equipo y accesos", icon: UsersRound, adminOnly: false },
  { href: "/integrations", label: "Conectores", icon: PlugZap, adminOnly: true },
  { href: "/reports", label: "Indicadores", icon: Activity, adminOnly: false },
  { href: "/settings", label: "Configuración", icon: Settings2, adminOnly: true },
];

const pageInfo: Record<string, { title: string; subtitle: string; section: string }> = {
  "/": { title: "Resumen operativo", subtitle: "Estado en tiempo real de la agenda Rayen, confirmaciones omnicanal y Tótem SOME.", section: "Resumen" },
  "/appointments": { title: "Agenda y lista de espera", subtitle: "Ingreso de pacientes reales, confirmación manual en mesón SOME y reasignación exprés.", section: "Gestión de agenda" },
  "/risk": { title: "Revisión de inasistencia (XGBoost)", subtitle: "Cálculo real de probabilidad NSP sobre variables clínicas y territoriales.", section: "IA Predictiva" },
  "/communications": { title: "Comunicaciones omnicanal", subtitle: "Procesamiento IA de WhatsApp, transcripción de voz y alertas Ley Preferente.", section: "Canales de contacto" },
  "/kiosk": { title: "Monitor del Tótem IoT · ESP32-CAM", subtitle: "Validación real de cédula chilena (Módulo 11 + Serie SIDIV) sin duplicados.", section: "Dispositivo presencial" },
  "/staff": { title: "Equipo y accesos", subtitle: "Personal clínico y administrativo habilitado en el establecimiento.", section: "Administración del equipo" },
  "/integrations": { title: "Conectores e infraestructura", subtitle: "Supervisión de endpoints, API Keys y bases de datos Neon PostgreSQL.", section: "Conexiones" },
  "/reports": { title: "Indicadores de gestión APS", subtitle: "Métricas de adherencia, cupos recuperados y tiempos de acreditación.", section: "Reportes" },
  "/settings": { title: "Configuración operativa", subtitle: "Parámetros de contacto preventivo y administración del entorno piloto.", section: "Preferencias" },
};

const statusClass = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes("cancel") || lower.includes("error") || lower.includes("sin_cita") || lower.includes("rechaz")) return "status missed";
  if (lower.includes("pendiente") || lower.includes("confirmar") || lower.includes("pruebas")) return "status pending";
  if (lower.includes("presente") || lower.includes("confirmada") || lower.includes("reasignada") || lower.includes("revisado") || lower.includes("conectado") || lower.includes("validado") || lower.includes("disponible")) return "status";
  return "status neutral";
};

function Badge({ children }: { children: string }) {
  return <span className={statusClass(children)}>{children}</span>;
}

export default function PortalPage({ user, onLogout }: PortalPageProps) {
  const [path, setLocation] = useLocation();
  const canViewSystemAdmin =
    user.role === "SOPORTE IOT / TÓTEM" || user.role === "COORDINACIÓN CLÍNICA";
  const canEditSystemAdmin = user.role === "SOPORTE IOT / TÓTEM";
  const visibleNav = allNav.filter((item) => !item.adminOnly || canViewSystemAdmin);
  const current = pageInfo[path] ? path : "/";

  useEffect(() => {
    if ((current === "/integrations" || current === "/settings") && !canViewSystemAdmin) {
      setLocation("/");
    }
  }, [current, canViewSystemAdmin, setLocation]);

  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [dayFilter, setDayFilter] = useState("Hoy");
  const [showWaitlist, setShowWaitlist] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [preferences, setPreferences] = useState([true, true, true, true]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const authHeaders = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-staff-role": encodeURIComponent(user.role),
    }),
    [user.role],
  );

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage((prev) => (prev === msg ? "" : prev)), 5500);
  };

  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch("/api/bootstrap", {
        headers: { "x-staff-role": encodeURIComponent(user.role) },
      });
      if (res.ok) {
        const json: BootstrapPayload = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  const handleManualCheckin = async (appt: Appointment) => {
    const res = await fetch(`/api/appointments/${appt.id}/checkin`, { method: "POST" });
    if (res.ok) {
      notify(`Llegada confirmada en mesón SOME: ${appt.patient.fullName} (${appt.boxNumber}).`);
      await fetchBootstrap();
    }
  };

  const handleConfirmAppt = async (appt: Appointment) => {
    const res = await fetch(`/api/appointments/${appt.id}/confirm`, { method: "POST" });
    if (res.ok) {
      notify(`Cita ${appt.id} marcada como Confirmada.`);
      await fetchBootstrap();
    }
  };

  const handleCancelAppt = async (appt: Appointment) => {
    const res = await fetch(`/api/appointments/${appt.id}/cancel`, { method: "POST" });
    if (res.ok) {
      notify(`Cita ${appt.id} cancelada. Cupo liberado para Slot-Filling.`);
      await fetchBootstrap();
    }
  };

  const handleSlotFill = async (appt: Appointment, waitlistId?: number) => {
    const res = await fetch(`/api/appointments/${appt.id}/slot-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistId }),
    });
    const body = await res.json();
    if (res.ok && body.appointment) {
      notify(`Cupo ${appt.scheduledTime} hrs reasignado a ${body.appointment.patient.fullName}.`);
      await fetchBootstrap();
    } else {
      notify(body.error || "No fue posible reasignar el cupo.");
    }
  };

  const appointments = data?.appointments || [];
  const filteredAppointments = appointments.filter((item) => {
    const matchesDay = dayFilter === "Todos" || item.dayLabel === dayFilter;
    const matchesQuery = `${item.patient.fullName} ${item.patient.rut} ${item.patient.rayenFicha} ${item.specialty} ${item.id}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFilter = filter === "Todos" || item.status === filter;
    return matchesDay && matchesQuery && matchesFilter;
  });

  const renderNavLink = (item: typeof allNav[number], mobile = false) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-link${current === item.href ? " active" : ""}`}
        onClick={() => mobile && setMobileOpen(false)}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const head = pageInfo[current];

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <img
            src="/logo-kura.png"
            alt="Kura"
            width={38}
            height={38}
            style={{ borderRadius: 10, objectFit: "contain" }}
          />
          <div>
            <strong>Kura</strong>
            <small>CESFAM Providencia</small>
          </div>
        </div>
        <div className="nav-label">Espacio de trabajo</div>
        <nav className="nav-list" aria-label="Navegación principal">
          {visibleNav.map((item) => renderNavLink(item))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-chip">
            <div className="pilot-user-row">
              <div className="pilot-avatar" aria-hidden="true">
                {user.fullName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <b>{user.fullName}</b>
                <span>{user.role}</span>
              </div>
            </div>
            <div className="db-status-line">
              <span>{data?.dbMode || "Conectando..."}</span>
            </div>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={onLogout}
          >
            <LogOut size={15} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <main className={`content${mobileOpen ? " menu-expanded" : ""}`}>
          <div className="page-head">
            <div>
              <div className="eyebrow">{head.section} · {user.unit}</div>
              <h1>{head.title}</h1>
              <p>{head.subtitle}</p>
            </div>
            <div className="head-actions">
              <button type="button" className="button" onClick={fetchBootstrap} title="Actualizar datos">
                <RefreshCw size={14} /> Actualizar
              </button>
              <button type="button" className="button warn mobile-logout-btn" onClick={onLogout}>
                <LogOut size={14} /> Salir
              </button>
            </div>
          </div>
          {statusMessage && (
            <div className="inline-feedback" role="status">
              <CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 6, color: "#15803D" }} />
              {statusMessage}
            </div>
          )}
          {loading && !data ? (
            <div className="card card-pad">Cargando agenda clínica y telemetría Kura...</div>
          ) : (
            <>
              {current === "/" && (
                <Overview data={data!} canViewSystemAdmin={canViewSystemAdmin} onCheckin={handleManualCheckin} />
              )}
              {current === "/appointments" && (
                <Appointments
                  appointments={filteredAppointments}
                  query={query}
                  setQuery={setQuery}
                  filter={filter}
                  setFilter={setFilter}
                  dayFilter={dayFilter}
                  setDayFilter={setDayFilter}
                  waitlist={data?.waitlist || []}
                  showWaitlist={showWaitlist}
                  setShowWaitlist={setShowWaitlist}
                  onCheckin={handleManualCheckin}
                  onConfirm={handleConfirmAppt}
                  onCancel={handleCancelAppt}
                  onSlotFill={handleSlotFill}
                  onRefresh={fetchBootstrap}
                  notify={notify}
                />
              )}
              {current === "/risk" && (
                <Risk
                  appointments={appointments}
                  modelVersion={data?.mlModelVersion || "XGBoost-Kura-v1.3"}
                  lastCalculatedAt={data?.mlLastCalculatedAt || "Ahora"}
                  onRefresh={fetchBootstrap}
                  notify={notify}
                />
              )}
              {current === "/communications" && (
                <Communications
                  items={data?.communications || []}
                  patients={data?.patients || []}
                  aiConnected={Boolean(data?.aiConnected)}
                  aiEngineName={data?.aiEngineName || "Motor NLP Clínico Local"}
                  canEditSystemAdmin={canEditSystemAdmin}
                  authHeaders={authHeaders}
                  query={query}
                  setQuery={setQuery}
                  onRefresh={fetchBootstrap}
                  notify={notify}
                />
              )}
              {current === "/kiosk" && (
                <Kiosk
                  events={data?.iotEvents || []}
                  appointments={appointments}
                  avgLatency={data?.kpis.avgTotemLatencyMs || 214}
                  onRefresh={fetchBootstrap}
                  notify={notify}
                />
              )}
              {current === "/staff" && <Staff users={data?.staffUsers || []} />}
              {current === "/integrations" && canViewSystemAdmin && (
                <Integrations
                  connectors={data?.connectors || []}
                  canEdit={canEditSystemAdmin}
                  authHeaders={authHeaders}
                  onRefresh={fetchBootstrap}
                  notify={notify}
                />
              )}
              {current === "/reports" && <Reports data={data!} />}
              {current === "/settings" && canViewSystemAdmin && (
                <Settings
                  preferences={preferences}
                  setPreferences={setPreferences}
                  canEdit={canEditSystemAdmin}
                  notify={notify}
                  onReset={async () => {
                    const res = await fetch("/api/reset-demo", {
                      method: "POST",
                      headers: authHeaders(),
                    });
                    if (res.ok) {
                      const fresh = await res.json();
                      setData(fresh);
                      notify("Datos de demostración restaurados a su estado inicial.");
                    } else {
                      const err = await res.json();
                      notify(err.error || "No tienes permisos para realizar esta acción.");
                    }
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
      <nav className={`mobile-nav${mobileOpen ? " expanded" : ""}`} aria-label="Navegación móvil">
        {(mobileOpen ? visibleNav : visibleNav.slice(0, 4)).map((item) => renderNavLink(item, true))}
        <button
          className="nav-link nav-more"
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
          <span>{mobileOpen ? "Cerrar" : "Más"}</span>
        </button>
      </nav>
    </div>
  );
}

function Overview({
  data, canViewSystemAdmin, onCheckin,
}: {
  data: BootstrapPayload;
  canViewSystemAdmin: boolean;
  onCheckin: (a: Appointment) => void;
}) {
  const todayAppts = data.appointments.filter((a) => a.dayLabel === "Hoy");
  return (
    <>
      <div className="stats-grid">
        <Stat label="Citas jornada hoy" value={String(data.kpis.totalToday)} meta={`${data.kpis.presentCount} presentes en sala`} icon={<CalendarDays />} />
        <Stat label="Tasa confirmación" value={`${data.kpis.confirmationRate}%`} meta={`${data.kpis.pendingCount} pendientes de respuesta`} icon={<CircleCheck />} />
        <Stat label="Lista de espera" value={String(data.kpis.availableWaitlist)} meta={`${data.kpis.recoveredCount} cupos recuperados hoy`} icon={<UsersRound />} />
        <Stat label="Tótem SOME IoT" value={`${data.kpis.avgTotemLatencyMs} ms`} meta="Validación Módulo 11 activa" icon={<ScanLine />} />
      </div>
      <div className="overview-grid">
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Agenda inmediata (Hoy)</h2>
              <p>Acreditación presencial en ventanilla SOME o Tótem QR</p>
            </div>
            <Link href="/appointments" className="text-link">Ver agenda completa <ArrowUpRight size={13} /></Link>
          </div>
          <div className="schedule-list">
            {todayAppts.slice(0, 7).map((item) => (
              <div className="schedule-row" key={item.id}>
                <div className="time" style={{ fontSize: item.scheduledTime.length > 6 ? 11 : undefined, lineHeight: 1.2 }}>
                  {item.scheduledTime}
                </div>
                <div>
                  <div className="person">
                    {item.patient.fullName}{" "}
                    <span style={{ fontWeight: 400, color: "#64748B" }}>({item.patient.rut})</span>
                    {item.patient.isRealUserAdded && (
                      <span className="status" style={{ marginLeft: 6, background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }}>
                        Dato Real
                      </span>
                    )}
                  </div>
                  <div className="subtext">
                    {item.specialty} · {item.boxNumber} · Ficha {item.patient.rayenFicha}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge>{item.status}</Badge>
                  {item.status !== "Presente en sala" && item.status !== "Cancelada" && (
                    <button
                      type="button"
                      className="button tiny primary"
                      onClick={() => onCheckin(item)}
                    >
                      <UserCheck size={13} /> Confirmar llegada
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Accesos directos</h2>
              <p>Operación clínica y pruebas en vivo</p>
            </div>
          </div>
          <div className="quick-list">
            <Link className="quick-item quick-link" href="/appointments">
              <span className="quick-icon"><UserPlus /></span>
              <span><b>Ingresar Paciente / RUT Real</b><small>Agrega pacientes reales con validación Módulo 11.</small></span>
              <ChevronRight className="quick-arrow" />
            </Link>
            <Link className="quick-item quick-link" href="/kiosk">
              <span className="quick-icon"><QrCode /></span>
              <span><b>Tótem QR Cédula (Validación Real)</b><small>Valida RUT Módulo 11, Serie SIDIV o Cámara Web.</small></span>
              <ChevronRight className="quick-arrow" />
            </Link>
            <Link className="quick-item quick-link" href="/communications">
              <span className="quick-icon"><Bot /></span>
              <span><b>Comunicaciones Omnicanal IA</b><small>Procesa mensajes de pacientes y actualiza citas.</small></span>
              <ChevronRight className="quick-arrow" />
            </Link>
          </div>
        </section>
      </div>
      <div className="two-col" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Últimas lecturas Tótem IoT</h2>
              <p>Validación documental de cédula chilena</p>
            </div>
            <Link href="/kiosk" className="text-link">Abrir monitor</Link>
          </div>
          {data.iotEvents.slice(0, 3).map((ev) => (
            <div className="metric" key={ev.id}>
              <span>
                <b>{ev.patientName}</b> · {ev.rutExtracted} ({ev.createdAt})
              </span>
              <Badge>{`${ev.status} · ${ev.latencyMs} ms`}</Badge>
            </div>
          ))}
        </section>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Estado operativo de servicios</h2>
              <p>Disponibilidad de módulos clínicos</p>
            </div>
            {canViewSystemAdmin && <Link href="/integrations" className="text-link">Ver conectores</Link>}
          </div>
          <div className="metric"><span>IA Predictiva ({data.mlModelVersion})</span><Badge>Conectado</Badge></div>
          <div className="metric"><span>Canal Omnicanal ({data.aiEngineName})</span><Badge>{data.aiConnected ? "Conectado" : "Activo"}</Badge></div>
          <div className="metric"><span>Tótem Presencial ESP32</span><Badge>Conectado</Badge></div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, meta, icon }: { label: string; value: string; meta: string; icon: ReactNode }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-meta">{meta}</div>
      <span style={{ position: "absolute", right: 14, top: 14, color: "#64748B" }}>{icon}</span>
    </div>
  );
}

function Appointments({
  appointments, query, setQuery, filter, setFilter, dayFilter, setDayFilter,
  waitlist, showWaitlist, setShowWaitlist, onCheckin, onConfirm, onCancel, onSlotFill,
  onRefresh, notify,
}: {
  appointments: Appointment[];
  query: string;
  setQuery: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  dayFilter: string;
  setDayFilter: (v: string) => void;
  waitlist: WaitlistEntry[];
  showWaitlist: boolean;
  setShowWaitlist: (v: boolean) => void;
  onCheckin: (a: Appointment) => void;
  onConfirm: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onSlotFill: (a: Appointment, waitlistId?: number) => void;
  onRefresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const weeklyDays = getWeeklyDays();

  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [rut, setRut] = useState("");
  const [age, setAge] = useState("34");
  const [sector, setSector] = useState("Sector Azul");
  const [distanceKm, setDistanceKm] = useState("2.4");
  const [fonasaTramo, setFonasaTramo] = useState("B");
  const [preferentialLaw, setPreferentialLaw] = useState(false);
  const [totalAppts, setTotalAppts] = useState("5");
  const [nspCount, setNspCount] = useState("1");
  const [specialty, setSpecialty] = useState("Odontología General");
  const [boxNumber, setBoxNumber] = useState("Box Dental 3");
  const [dayLabel, setDayLabel] = useState("Hoy");
  const [scheduledTime, setScheduledTime] = useState("08:00 - 08:30");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const availableBlocks = getBlocksForSpecialty(specialty);
  const currentDuration = SPECIALTY_BLOCK_MINUTES[specialty] ?? 30;
  const cancelledAppt = appointments.find((a) => a.status === "Cancelada");

const handleSpecialtyChange = (nextSpecialty: string) => {
    setSpecialty(nextSpecialty);
    const nextBlocks = getBlocksForSpecialty(nextSpecialty);
    setScheduledTime(nextBlocks[0]?.value || "08:00 - 08:30");

    if (
      nextSpecialty.includes("Cirugía") ||
      nextSpecialty.includes("Endodoncia") ||
      nextSpecialty.includes("Prótesis")
    ) {
      setBoxNumber("Box Dental 4");
    } else {
      setBoxNumber("Box Dental 3");
    }
  };

  const handleCreateReal = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          rut,
          age: Number(age),
          sector,
          distanceKm: Number(distanceKm),
          fonasaTramo,
          preferentialLaw,
          totalAppointments: Number(totalAppts),
          nspHistoryCount: Number(nspCount),
          specialty,
          boxNumber,
          dayLabel,
          scheduledTime,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setFormError(body.error || "No se pudo registrar el paciente.");
      } else {
        notify(`Paciente real agregado: ${body.patient.fullName} (${body.patient.rut}) · Riesgo calculado: ${body.appointment.riskScore}%.`);
        setFullName("");
        setRut("");
        setShowAddForm(false);
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="two-col">
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Agenda clínica Rayen</h2>
            <p>Combina pacientes precargados con datos reales (validación RUT Módulo 11)</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge>{`${appointments.length} citas`}</Badge>
            <button
              type="button"
              className="button tiny primary"
              onClick={() => {
                setShowAddForm(!showAddForm);
                setFormError("");
              }}
            >
              {showAddForm ? <X size={13} /> : <UserPlus size={13} />}
              {showAddForm ? "Cerrar formulario" : "Añadir Paciente Real"}
            </button>
          </div>
        </div>
        {showAddForm && (
          <form onSubmit={handleCreateReal} className="card card-pad" style={{ background: "#F4F8F9", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#163A50" }}>
              Ingresar Paciente y Cita Real (Validación RUT Módulo 11)
            </div>
            <div className="three-col" style={{ marginBottom: 8 }}>
              <div className="field">
                <label>Nombre completo *</label>
                <input className="control" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: Matías Muñoz González" required />
              </div>
              <div className="field">
                <label>RUT Chileno Real *</label>
                <input className="control" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="Ej: 19.412.670-5" required />
              </div>
              <div className="field">
                <label>Edad</label>
                <input type="number" min={1} max={110} className="control" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
            </div>
            <div className="three-col" style={{ marginBottom: 8 }}>
              <div className="field">
                <label>Sector Territorial</label>
                <select className="control" style={{ width: "100%" }} value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option>Sector Azul</option>
                  <option>Sector Verde</option>
                  <option>Sector Rojo</option>
                </select>
              </div>
              <div className="field">
                <label>Distancia al CESFAM (km)</label>
                <input type="number" step="0.1" min={0.1} max={50} className="control" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
              </div>
              <div className="field">
                <label>Tramo FONASA</label>
                <select className="control" style={{ width: "100%" }} value={fonasaTramo} onChange={(e) => setFonasaTramo(e.target.value)}>
                  <option value="A">FONASA A</option>
                  <option value="B">FONASA B</option>
                  <option value="C">FONASA C</option>
                  <option value="D">FONASA D</option>
                </select>
              </div>
            </div>
            <div className="three-col" style={{ marginBottom: 10 }}>
              <div className="field">
                <label>Citas totales / NSP previas</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" min={0} max={99} className="control" value={totalAppts} onChange={(e) => setTotalAppts(e.target.value)} title="Citas históricas" />
                  <input type="number" min={0} max={99} className="control" value={nspCount} onChange={(e) => setNspCount(e.target.value)} title="Inasistencias previas" />
                </div>
              </div>
<div className="field">
                <label>Especialidad Odontológica (Bloque: {currentDuration} min)</label>
                <select
                  className="control"
                  style={{ width: "100%" }}
                  value={specialty}
                  onChange={(e) => handleSpecialtyChange(e.target.value)}
                >
                  <optgroup label="Odontología General CESFAM (30 min)">
                    <option value="Odontología General">Odontología General (30 min)</option>
                    <option value="Urgencia Dental / Evaluación">Urgencia Dental / Evaluación (30 min)</option>
                    <option value="Control Salud Oral">Control Salud Oral (30 min)</option>
                    <option value="Operatoria / Destartraje">Operatoria / Destartraje (30 min)</option>
                    <option value="Periodoncia">Periodoncia (30 min)</option>
                    <option value="Odontopediatría">Odontopediatría (30 min)</option>
                  </optgroup>
                  <optgroup label="Especialidades Odontológicas (45 min)">
                    <option value="Endodoncia">Endodoncia · Especialidad (45 min)</option>
                    <option value="Prótesis Dental">Prótesis Dental · Rehabilitación (45 min)</option>
                  </optgroup>
                  <optgroup label="Procedimientos Complejos / Cirugía (60 min)">
                    <option value="Cirugía Bucal / Exodoncia Compleja">Cirugía Bucal / Exodoncia Compleja (60 min)</option>
                    <option value="Endodoncia Molar Compleja">Endodoncia Molar Compleja (60 min)</option>
                  </optgroup>
                </select>
              </div>
              <div className="field">
                <label>Día de la Semana y Bloque</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    className="control"
                    style={{ width: "50%" }}
                    value={dayLabel}
                    onChange={(e) => setDayLabel(e.target.value)}
                  >
                    {weeklyDays.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="control"
                    style={{ width: "50%" }}
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  >
                    {availableBlocks.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#334155", cursor: "pointer" }}>
                <input type="checkbox" checked={preferentialLaw} onChange={(e) => setPreferentialLaw(e.target.checked)} />
                Atención Preferente (Ley 20.584 · Adulto Mayor / Discapacidad)
              </label>
              <button type="submit" className="button tiny primary" disabled={saving}>
                <CheckCircle2 size={13} /> {saving ? "Validando RUT..." : "Guardar y Calcular Riesgo"}
              </button>
            </div>
            {formError && (
              <div className="banner caution" style={{ marginTop: 10, marginBottom: 0 }}>
                <div>{formError}</div>
              </div>
            )}
          </form>
        )}
        <div className="toolbar">
          <div className="search-wrap">
            <Search aria-hidden="true" />
            <input
              className="control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente, RUT, ficha o box..."
            />
          </div>
          <select className="control" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>Todos</option>
            <option>Presente en sala</option>
            <option>Confirmada</option>
            <option>Por confirmar</option>
            <option>Cancelada</option>
            <option>Reasignada</option>
          </select>
          <select className="control" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            {weeklyDays.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
            <option value="Todos">Toda la semana</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table appointments-table">
            <thead>
              <tr>
                <th>Hora / Paciente</th>
                <th>Box / Especialidad</th>
                <th>Estado</th>
                <th>Canal / Riesgo</th>
                <th>Acciones SOME</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="person">
                      {item.scheduledTime} · {item.patient.fullName}
                      {item.patient.isRealUserAdded && (
                        <span className="status" style={{ marginLeft: 6, background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }}>
                          Dato Real
                        </span>
                      )}
                    </div>
                    <div className="subtext">
                      {item.dayLabel} · RUT {item.patient.rut} · {item.patient.rayenFicha}
                      {item.patient.preferentialLaw && " · ★ Ley Preferente"}
                    </div>
                  </td>
                  <td>
                    <div>{item.specialty}</div>
                    <div className="subtext">{item.boxNumber} · {item.professionalName}</div>
                  </td>
                  <td>
                    <Badge>{item.status}</Badge>
                    {item.checkinAt && (
                      <div className="subtext">Acreditado {item.checkinAt}</div>
                    )}
                  </td>
                  <td>
                    <div>{item.channel}</div>
                    <div className="subtext">Riesgo NSP: <b>{item.riskScore}%</b></div>
                  </td>
                  <td>
                    <div className="row-actions" style={{ flexWrap: "wrap" }}>
                      {item.status !== "Presente en sala" && item.status !== "Cancelada" && (
                        <button
                          type="button"
                          className="button tiny primary"
                          onClick={() => onCheckin(item)}
                        >
                          <UserCheck size={13} /> Confirmar llegada
                        </button>
                      )}
                      {item.status === "Por confirmar" && (
                        <button
                          type="button"
                          className="button tiny"
                          onClick={() => onConfirm(item)}
                        >
                          Confirmar
                        </button>
                      )}
                      {item.status !== "Cancelada" && item.status !== "Presente en sala" && (
                        <button
                          type="button"
                          className="button tiny ghost"
                          style={{ color: "#B91C1C" }}
                          onClick={() => onCancel(item)}
                        >
                          Cancelar
                        </button>
                      )}
                      {item.status === "Cancelada" && (
                        <button
                          type="button"
                          className="button tiny warn"
                          onClick={() => onSlotFill(item)}
                        >
                          <Zap size={13} /> Reasignar cupo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Lista de espera priorizada</h2>
            <p>Candidatos listos para Slot-Filling ante cancelaciones</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowWaitlist(!showWaitlist)}
          >
            {showWaitlist ? <X size={16} /> : <Plus size={16} />}
          </button>
        </div>
        {showWaitlist && (
          <div className="quick-list">
            {waitlist.map((w) => (
              <div className="quick-item" key={w.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b>{w.patient.fullName} ({w.patient.rut})</b>
                  <Badge>{w.status}</Badge>
                </div>
                <small>{w.specialty} · Prioridad {w.priorityScore}/100 · {w.clinicalNote}</small>
                {w.status === "Disponible" && cancelledAppt && (
                  <button
                    type="button"
                    className="button tiny primary"
                    style={{ marginTop: 6 }}
                    onClick={() => onSlotFill(cancelledAppt, w.id)}
                  >
                    Asignar a cupo {cancelledAppt.scheduledTime} hrs ({cancelledAppt.boxNumber})
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Risk({
  appointments, modelVersion, lastCalculatedAt, onRefresh, notify,
}: {
  appointments: Appointment[];
  modelVersion: string;
  lastCalculatedAt: string;
  onRefresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const sorted = [...appointments].sort((a, b) => b.riskScore - a.riskScore);
  const highRiskCount = sorted.filter((a) => a.riskScore >= 65).length;

  const runRealRecalculation = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/ml/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelVersion: "XGBoost-Kura-v1.3" }),
      });
      if (res.ok) {
        const body = await res.json();
        notify(`Cálculo real ejecutado sobre ${body.updated} citas (${body.modelVersion}).`);
        await onRefresh();
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="banner caution">
        <AlertTriangle />
        <div>
          <strong>Revisión humana obligatoria (Ética Clínica APS)</strong>
          El modelo XGBoost calcula la probabilidad NSP a partir de historial real, distancia territorial, estado T-24h y barreras reportadas; nunca bloquea el derecho a atención.
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Riesgo alto (≥ 65%)" value={String(highRiskCount)} meta="Prioridad de contacto" icon={<ShieldAlert />} />
        <Stat label="Citas evaluadas" value={String(appointments.length)} meta={`Último cálculo: ${lastCalculatedAt}`} icon={<ClipboardCheck />} />
        <Stat label="ROC-AUC Validación" value="0.842" meta={modelVersion} icon={<Cpu />} />
        <Stat label="Decisión final" value="Equipo SOME" meta="Supervisión humana" icon={<UsersRound />} />
      </div>
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Ranking de riesgo de inasistencia (Cálculo en vivo)</h2>
            <p>Variables evaluadas: Tasa NSP histórica (peso +3.35) · Distancia km (+0.25/km) · Estado confirmación (-1.45) · Barreras omnicanal (+1.25)</p>
          </div>
          <button type="button" className="button primary" onClick={runRealRecalculation} disabled={syncing}>
            <Zap size={14} /> {syncing ? "Calculando modelo..." : "Recalcular Riesgo (XGBoost)"}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Paciente / Cita</th>
                <th>Variables de entrada</th>
                <th>Probabilidad NSP</th>
                <th>Factores explicativos</th>
                <th>Estado agenda</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="person">
                      {item.patient.fullName}
                      {item.patient.isRealUserAdded && (
                        <span className="status" style={{ marginLeft: 6, background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }}>
                          Dato Real
                        </span>
                      )}
                    </div>
                    <div className="subtext">{item.dayLabel} {item.scheduledTime} · {item.specialty} · {item.patient.sector}</div>
                  </td>
                  <td>
                    <div className="subtext" style={{ marginTop: 0 }}>
                      NSP: <b>{item.patient.nspHistoryCount}/{item.patient.totalAppointments}</b> · Dist: <b>{item.patient.distanceKm} km</b> · Edad: <b>{item.patient.age}a</b>
                    </div>
                  </td>
                  <td>
                    <div className="risk-meter">
                      <div className="risk-bar">
                        <i style={{ width: `${item.riskScore}%`, background: item.riskScore >= 65 ? "#DC2626" : item.riskScore >= 35 ? "#D97706" : "#16A34A" }} />
                      </div>
                      <b>{item.riskScore}%</b>
                    </div>
                  </td>
                  <td>{item.riskReasons.join(" · ")}</td>
                  <td><Badge>{item.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Communications({
  items, patients, aiConnected, aiEngineName, canEditSystemAdmin, authHeaders, query, setQuery, onRefresh, notify,
}: {
  items: CommunicationItem[];
  patients: Patient[];
  aiConnected: boolean;
  aiEngineName: string;
  canEditSystemAdmin: boolean;
  authHeaders: () => Record<string, string>;
  query: string;
  setQuery: (v: string) => void;
  onRefresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [intentFilter, setIntentFilter] = useState("Todas");
  const [selectedPatientId, setSelectedPatientId] = useState<number>(patients[1]?.id || 2);
  const [channel, setChannel] = useState("WhatsApp Texto");
  const [messageText, setMessageText] = useState("Hola, confirmo que asistiré hoy a mi hora dental sin problemas.");
  const [analyzing, setAnalyzing] = useState(false);
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    if (patients.length > 0 && !patients.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  const visible = items.filter(
    (c) =>
      (intentFilter === "Todas" || c.intent === intentFilter) &&
      `${c.patientName} ${c.intent} ${c.channel} ${c.transcript}`.toLowerCase().includes(query.toLowerCase()),
  );

  const handleAnalyzeMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/communications/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: Number(selectedPatientId),
          channel,
          transcript: messageText,
        }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        notify(`IA (${body.communication.aiEngine}) clasificó: «${body.communication.intent}» y actualizó la agenda.`);
        setMessageText("");
        await onRefresh();
      } else {
        notify(body.error || "No se pudo procesar el mensaje.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveGeminiKey = async (e: FormEvent) => {
    e.preventDefault();
    setSavingKey(true);
    try {
      const res = await fetch("/api/connectors/voice_ai", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          authToken: geminiKey.trim(),
          status: geminiKey.trim().startsWith("AIza") ? "Conectado" : "En pruebas",
        }),
      });
      if (res.ok) {
        setShowKeyBox(false);
        setGeminiKey("");
        notify("API Key de Google Gemini guardada por Soporte TI.");
        await onRefresh();
      } else {
        const err = await res.json();
        notify(err.error || "No tienes permisos para modificar API Keys.");
      }
    } finally {
      setSavingKey(false);
    }
  };

  const markReviewed = async (id: number) => {
    const res = await fetch(`/api/communications/${id}/review`, { method: "POST" });
    if (res.ok) {
      notify("Interacción marcada como revisada por equipo SOME.");
      await onRefresh();
    }
  };

  return (
    <div className="two-col">
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Bandeja omnicanal (WhatsApp y Voz)</h2>
            <p>Clasificación automática de intención y actualización directa de agenda</p>
          </div>
          <Badge>{`${visible.length} registros`}</Badge>
        </div>
        <form onSubmit={handleAnalyzeMessage} className="card card-pad" style={{ background: "#F4F8F9", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#163A50", display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} color="#216E9E" /> Simular mensaje o nota de voz entrante
            </span>
            <Badge>{aiEngineName}</Badge>
          </div>
          <div className="two-col" style={{ marginBottom: 8, gridTemplateColumns: "1.3fr 0.7fr" }}>
            <select
              className="control"
              style={{ width: "100%" }}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(Number(e.target.value))}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.rut}) {p.isRealUserAdded ? "★ Dato Real" : ""}
                </option>
              ))}
            </select>
            <select className="control" style={{ width: "100%" }} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option>WhatsApp Texto</option>
              <option>Nota de Voz IA</option>
              <option>Llamada Saliente</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="control"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Escribe un mensaje del paciente (ej: 'Confirmo asistencia' o 'No tengo locomoción hoy')..."
              required
            />
            <button type="submit" className="button primary" disabled={analyzing}>
              <Send size={14} /> {analyzing ? "Analizando..." : "Procesar con IA"}
            </button>
          </div>
        </form>
        <div className="toolbar">
          <div className="search-wrap">
            <Search />
            <input
              className="control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente o mensaje..."
            />
          </div>
          <select className="control" value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)}>
            <option>Todas</option>
            <option>Confirma asistencia</option>
            <option>Cancela por movilidad</option>
            <option>Solicita reagendar</option>
            <option>Consulta administrativa</option>
          </select>
        </div>
        <div className="quick-list">
          {visible.map((item) => (
            <article className="quick-item message-card" key={item.id}>
              <span className="quick-icon">
                {item.channel.includes("Voz") ? <Headphones /> : item.channel.includes("Llamada") ? <Phone /> : <MessagesSquare />}
              </span>
              <div className="message-card-content">
                <div className="message-card-head">
                  <b>{item.patientName} · {item.channel}</b>
                  <span style={{ fontSize: 11, color: "#64748B" }}>{item.timeLabel}</span>
                  <Badge>{item.reviewStatus}</Badge>
                </div>
                <div className="subtext">
                  Intención: <b>{item.intent}</b>
                  {item.rootCause && ` · Causa: ${item.rootCause}`}
                  {item.aiEngine && ` · Motor: ${item.aiEngine}`}
                  {item.vulnerabilityAlert && " · ⚠ Alerta Ley Preferente 20.584"}
                </div>
                <p className="message-transcript">«{item.transcript.replace(/^«|»$/g, "")}»</p>
                {item.suggestedReply && (
                  <div className="inline-note" style={{ marginTop: 8, background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1E40AF" }}>
                    <Bot size={14} />
                    <span><b>Respuesta IA sugerida:</b> {item.suggestedReply}</span>
                  </div>
                )}
                {item.reviewStatus !== "Revisado" && (
                  <div className="message-card-actions">
                    <button type="button" className="button tiny" onClick={() => markReviewed(item.id)}>
                      Marcar revisado
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Canales de contacto activos</h2>
            <p>Operación automatizada para pacientes</p>
          </div>
          <Badge>{aiConnected ? "IA Gemini Activa" : "Motor Local"}</Badge>
        </div>
        <div className="metric"><span>Motor IA Activo</span><b>{aiEngineName}</b></div>
        <div className="metric"><span>WhatsApp Business Webhook</span><Badge>Conectado</Badge></div>
        <div className="metric"><span>Voicebot IVR Adulto Mayor</span><Badge>Conectado</Badge></div>
        {canEditSystemAdmin ? (
          <>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="button tiny primary" onClick={() => setShowKeyBox(!showKeyBox)}>
                <KeyRound size={13} /> {aiConnected ? "Actualizar GEMINI_API_KEY" : "Configurar GEMINI_API_KEY (Soporte TI)"}
              </button>
            </div>
            {showKeyBox && (
              <form onSubmit={handleSaveGeminiKey} style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <input
                  type="password"
                  className="control"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Pega tu clave AIzaSy... de Google AI Studio"
                  required
                />
                <button type="submit" className="button tiny primary" disabled={savingKey}>
                  {savingKey ? "Conectando..." : "Guardar y Activar IA Real"}
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="inline-note" style={{ marginTop: 14 }}>
            <ShieldCheck size={15} />
            <span>La configuración de credenciales e integraciones técnicas es administrada exclusivamente por Soporte TI.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function Kiosk({
  events, appointments, avgLatency, onRefresh, notify,
}: {
  events: IotEventItem[];
  appointments: Appointment[];
  avgLatency: number;
  onRefresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [qrInput, setQrInput] = useState(
    "https://portal.sidiv.registrocivil.cl/docstatus?RUN=15432890-K&type=CEDULA&serial=604129811",
  );
  const [validationCard, setValidationCard] = useState<{
    ok: boolean;
    alreadyCheckedIn?: boolean;
    title: string;
    detail: string;
    rutFormatted?: string;
    mod11?: boolean;
    docType?: string;
    docSerial?: string;
    authority?: string;
    ms?: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMsg, setCameraMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const realPatientToday = appointments.find((a) => a.dayLabel === "Hoy" && a.patient.isRealUserAdded);

  const executeScan = useCallback(async (payloadToSend: string) => {
    if (!payloadToSend.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/iot/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawPayload: payloadToSend, deviceId: "TOTEM-SOME-01" }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setValidationCard({
          ok: true,
          alreadyCheckedIn: Boolean(body.alreadyCheckedIn),
          title: body.alreadyCheckedIn
            ? `Paciente ya acreditado previamente (${body.latencyMs} ms)`
            : `Cédula Validada Correctamente (${body.latencyMs} ms)`,
          detail: body.displayMessage,
          rutFormatted: body.parsed?.rutFormatted,
          mod11: body.parsed?.isValidMod11,
          docType: body.parsed?.documentType,
          docSerial: body.parsed?.documentSerial,
          authority: body.parsed?.registryAuthority,
          ms: body.latencyMs,
        });
        notify(
          body.alreadyCheckedIn
            ? "Idempotencia activa: el paciente ya estaba en sala (no se duplicó el registro)."
            : `Validación real exitosa: ${body.parsed?.rutFormatted} · Serie ${body.parsed?.documentSerial}.`,
        );
        await onRefresh();
      } else {
        setValidationCard({
          ok: false,
          title: "Validación de Cédula Rechazada / Sin Hora",
          detail: body.message || body.error || "No se pudo validar el documento.",
          rutFormatted: body.parsed?.rutFormatted,
          mod11: body.parsed?.isValidMod11,
          docType: body.parsed?.documentType,
          docSerial: body.parsed?.documentSerial,
          authority: body.parsed?.registryAuthority,
        });
      }
    } finally {
      setSending(false);
    }
  }, [notify, onRefresh]);

  useEffect(() => {
    if (!cameraActive) return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const BarcodeDetectorCtor = (window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector;
        if (!BarcodeDetectorCtor) {
          setCameraMsg("Cámara activa, pero tu navegador no soporta lectura automática QR. Pega el texto QR o usa el ESP32-CAM.");
          return;
        }
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === 4) {
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                const raw = codes[0].rawValue;
                setQrInput(raw);
                setCameraActive(false);
                await executeScan(raw);
              }
            } catch {
              // ignore frame read error
            }
          }
        }, 450);
      } catch {
        setCameraMsg("No se detectó cámara disponible en este equipo. Puedes pegar la cadena QR de tu cédula abajo.");
        setCameraActive(false);
      }
    };
    startCamera();
    return () => {
      if (timer) window.clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraActive, executeScan]);

  return (
    <>
      <div className="banner">
        <ScanLine />
        <div>
          <strong>Tótem Presencial ESP32-CAM · Validación Real Cédula Chilena + Anti-Duplicado</strong>
          Decodifica la URL oficial SIDIV del Registro Civil, verifica el Dígito Verificador Módulo 11, extrae el N° de Serie del documento y evita registros duplicados si el usuario vuelve a acercar su cédula.
        </div>
      </div>
      <div className="two-col">
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Lector / Simulador de Cédula de Identidad</h2>
              <p>Soporta cámara web real, ESP32-CAM físico o cadena QR SIDIV</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="button tiny"
                onClick={() => {
                  setCameraMsg("");
                  setCameraActive(!cameraActive);
                }}
              >
                <Camera size={13} /> {cameraActive ? "Cerrar Cámara" : "Escanear con Cámara"}
              </button>
              <Badge>Conectado</Badge>
            </div>
          </div>
          {cameraActive && (
            <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid #CBD5E1", background: "#0F172A" }}>
              <video ref={videoRef} style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} muted playsInline />
              <div style={{ padding: "6px 10px", fontSize: 11, color: "#E2E8F0" }}>
                Acerca el código QR del reverso de tu cédula de identidad chilena frente a la cámara...
              </div>
            </div>
          )}
          {cameraMsg && (
            <div className="banner caution" style={{ marginBottom: 10 }}>
              <div>{cameraMsg}</div>
            </div>
          )}
          <div className="three-col" style={{ marginBottom: 14 }}>
            <div className="quick-item">
              <span className="quick-icon"><Radio /></span>
              <span><small>Dispositivo</small><b>TOTEM-SOME-01</b></span>
            </div>
            <div className="quick-item">
              <span className="quick-icon"><Clock3 /></span>
              <span><small>Latencia media</small><b>{avgLatency} ms</b></span>
            </div>
            <div className="quick-item">
              <span className="quick-icon"><ShieldCheck /></span>
              <span><small>Seguridad</small><b>Módulo 11 + Anti-Dup</b></span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="qr-payload">Cadena QR Cédula Registro Civil (SIDIV) o RUT directo</label>
            <input
              id="qr-payload"
              className="control"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {realPatientToday && (
              <button
                type="button"
                className="button tiny"
                style={{ borderColor: "#2563EB", color: "#1D4ED8", background: "#EFF6FF" }}
                onClick={() => {
                  const cleanRun = realPatientToday.patient.rut.replace(/\./g, "");
                  setQrInput(`https://portal.sidiv.registrocivil.cl/docstatus?RUN=${cleanRun}&type=CEDULA&serial=789456123`);
                }}
              >
                Cargar QR {realPatientToday.patient.fullName.split(" ")[0]} (Dato Real)
              </button>
            )}
            <button
              type="button"
              className="button tiny"
              onClick={() =>
                setQrInput("https://portal.sidiv.registrocivil.cl/docstatus?RUN=15432890-K&type=CEDULA&serial=604129811")
              }
            >
              Cargar QR Carlos Fuentes
            </button>
            <button
              type="button"
              className="button tiny"
              onClick={() =>
                setQrInput("https://portal.sidiv.registrocivil.cl/docstatus?RUN=18234567-1&type=CEDULA&serial=598332104")
              }
            >
              Cargar QR Valentina Rojas
            </button>
            <button
              type="button"
              className="button tiny primary"
              onClick={() => executeScan(qrInput)}
              disabled={sending}
            >
              <QrCode size={14} /> {sending ? "Validando cédula..." : "Validar y Acreditar"}
            </button>
          </div>
          {validationCard && (
            <div
              className={`banner ${validationCard.ok ? "" : "caution"}`}
              style={{
                marginTop: 12,
                marginBottom: 0,
                background: validationCard.ok ? (validationCard.alreadyCheckedIn ? "#EFF6FF" : "#F0FDF4") : undefined,
                borderColor: validationCard.ok ? (validationCard.alreadyCheckedIn ? "#BFDBFE" : "#BBF7D0") : undefined,
                color: validationCard.ok ? (validationCard.alreadyCheckedIn ? "#1E40AF" : "#166534") : undefined,
              }}
            >
              <CheckCircle2 />
              <div style={{ width: "100%" }}>
                <strong>{validationCard.title}</strong>
                <div>{validationCard.detail}</div>
                {validationCard.rutFormatted && (
                  <div style={{ marginTop: 6, fontSize: 11, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span><b>RUN:</b> {validationCard.rutFormatted}</span>
                    <span><b>Módulo 11:</b> {validationCard.mod11 ? "Válido ✓" : "Inválido ✗"}</span>
                    <span><b>Documento:</b> {validationCard.docType}</span>
                    <span><b>N° Serie:</b> {validationCard.docSerial}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Historial de lecturas IoT (Sin duplicados)</h2>
              <p>Auditoría de cédulas validadas en el tótem</p>
            </div>
            <Badge>{`${events.length} eventos`}</Badge>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hora / Paciente</th>
                  <th>Validación Cédula</th>
                  <th>Latencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <div className="person">{ev.patientName}</div>
                      <div className="subtext">{ev.createdAt} · {ev.deviceId}</div>
                    </td>
                    <td>
                      <div><b>{ev.rutExtracted}</b> {ev.rutValidMod11 ? "✓ Mod-11" : ""}</div>
                      <div className="subtext">{ev.documentType} · Serie: {ev.documentSerial}</div>
                    </td>
                    <td>{ev.latencyMs} ms</td>
                    <td><Badge>{ev.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Staff({ users }: { users: StaffUser[] }) {
  return (
    <div className="two-col">
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Cuentas del equipo CESFAM</h2>
            <p>Personal con acceso autenticado al sistema</p>
          </div>
          <Badge>{`${users.length} activos`}</Badge>
        </div>
        <div className="table-wrap">
          <table className="data-table staff-table">
            <thead>
              <tr>
                <th>Funcionario</th>
                <th>Rol</th>
                <th>Unidad</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person">{u.fullName}</div>
                    <div className="subtext">{u.email} · {u.rut}</div>
                  </td>
                  <td><Badge>{u.role}</Badge></td>
                  <td>{u.unit}</td>
                  <td>{u.lastLoginAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <h2>Matriz de permisos RBAC</h2>
            <p>Segregación estricta de funciones clínicas y técnicas</p>
          </div>
        </div>
        <div className="metric"><span>Administración SOME</span><b>Agenda, Ingreso Real y Slot-Filling</b></div>
        <div className="metric"><span>Odontología / Box</span><b>Visualización agenda y sala de espera</b></div>
        <div className="metric"><span>Coordinación Clínica</span><b>Indicadores + Solo lectura Conectores/Config</b></div>
        <div className="metric"><span>Soporte IoT / Tótem</span><b>Administración total Conectores, API Keys y Config</b></div>
      </section>
    </div>
  );
}

function Integrations({
  connectors, canEdit, authHeaders, onRefresh, notify,
}: {
  connectors: ConnectorItem[];
  canEdit: boolean;
  authHeaders: () => Record<string, string>;
  onRefresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [urlVal, setUrlVal] = useState("");
  const [tokenVal, setTokenVal] = useState("");

  const startEdit = (c: ConnectorItem) => {
    if (!canEdit) return;
    setEditing(c.id);
    setUrlVal(c.endpointUrl);
    setTokenVal(c.authToken);
  };

  const saveEdit = async (id: string) => {
    if (!canEdit) return;
    const res = await fetch(`/api/connectors/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ endpointUrl: urlVal, authToken: tokenVal, status: "Conectado" }),
    });
    if (res.ok) {
      setEditing(null);
      notify("Configuración del conector guardada por Soporte TI.");
      await onRefresh();
    } else {
      const err = await res.json();
      notify(err.error || "No tienes permisos para modificar conectores.");
    }
  };

  return (
    <>
      {!canEdit && (
        <div className="banner">
          <Eye />
          <div>
            <strong>Modo solo lectura (Coordinación Clínica)</strong>
            Puedes supervisar el estado de conexión de los servicios e infraestructura, pero únicamente el equipo de <b>Soporte IoT / TI</b> está autorizado para modificar endpoints o API Keys.
          </div>
        </div>
      )}
      <div className="three-col">
        {connectors.map((c) => (
          <section className="card connector" key={c.id}>
            <div className="connector-top">
              <div className="connector-icon"><PlugZap /></div>
              <Badge>{c.status}</Badge>
            </div>
            <h3 style={{ marginTop: 12 }}>{c.name}</h3>
            <p>{c.scope}</p>
            <div className="subtext" style={{ marginBottom: 8 }}>Destino: <b>{c.dbTarget}</b></div>
            {canEdit && editing === c.id ? (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <input className="control" value={urlVal} onChange={(e) => setUrlVal(e.target.value)} placeholder="Endpoint URL" />
                <input className="control" value={tokenVal} onChange={(e) => setTokenVal(e.target.value)} placeholder="API Key / Token" />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="button tiny primary" onClick={() => saveEdit(c.id)}>Guardar</button>
                  <button type="button" className="button tiny" onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <small>{c.lastCheckedAt}</small>
                {canEdit ? (
                  <button type="button" className="button tiny" onClick={() => startEdit(c)}>Configurar</button>
                ) : (
                  <span className="status neutral"><Lock size={11} style={{ marginRight: 4 }} /> Solo lectura</span>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function Reports({ data }: { data: BootstrapPayload }) {
  return (
    <>
      <div className="stats-grid">
        <Stat label="Tasa confirmación" value={`${data.kpis.confirmationRate}%`} meta="Meta piloto: ≥ 85%" icon={<CircleCheck />} />
        <Stat label="Presentes en sala" value={String(data.kpis.presentCount)} meta="Acreditados hoy" icon={<UserCheck />} />
        <Stat label="Cupos recuperados" value={String(data.kpis.recoveredCount)} meta="Vía Slot-Filling" icon={<CalendarDays />} />
        <Stat label="Latencia Tótem" value={`${data.kpis.avgTotemLatencyMs} ms`} meta="Umbral máximo 500 ms" icon={<Clock3 />} />
      </div>
      <div className="two-col">
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Desglose por canal de confirmación</h2>
              <p>Distribución de interacciones en la jornada</p>
            </div>
          </div>
          <div className="metric"><span>WhatsApp Business Bot</span><b>45% de confirmaciones</b></div>
          <div className="metric"><span>Voz Telefónica / IVR Adulto Mayor</span><b>30% de confirmaciones</b></div>
          <div className="metric"><span>Tótem Presencial ESP32-CAM</span><b>15% acreditación directa</b></div>
          <div className="metric"><span>Mesón SOME Manual</span><b>10% acreditación asistida</b></div>
        </section>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Impacto operacional APS</h2>
              <p>Indicadores clave para Dirección Técnica</p>
            </div>
            <FileText size={16} />
          </div>
          <div className="metric"><span>Reducción proyectada NSP Dental</span><b>-32%</b></div>
          <div className="metric"><span>Tiempo promedio fila ventanilla SOME</span><b>-48%</b></div>
          <div className="metric"><span>Cobertura Ley Preferente 20.584</span><b>100% priorizada</b></div>
        </section>
      </div>
    </>
  );
}

function Settings({
  preferences, setPreferences, canEdit, notify, onReset,
}: {
  preferences: boolean[];
  setPreferences: (v: boolean[]) => void;
  canEdit: boolean;
  notify: (m: string) => void;
  onReset: () => Promise<void>;
}) {
  const options = [
    { title: "Recordatorios preventivos T-48h y T-24h", detail: "Envío escalonado según puntaje de riesgo XGBoost." },
    { title: "Confirmación rápida 1-clic en WhatsApp", detail: "Permite confirmar o liberar cupo instantáneamente." },
    { title: "Transcripción IA de notas de voz", detail: "Detección automática de barreras de movilidad en adultos mayores." },
    { title: "Idempotencia y Ring Buffer en Tótem ESP32-CAM", detail: "Evita lecturas duplicadas y almacena eventos ante microcortes." },
  ];
  return (
    <>
      {!canEdit && (
        <div className="banner">
          <Eye />
          <div>
            <strong>Modo solo lectura (Coordinación Clínica)</strong>
            Estás visualizando la configuración operativa vigente. Solo el perfil de <b>Soporte IoT / TI</b> puede modificar estos parámetros o reiniciar el entorno piloto.
          </div>
        </div>
      )}
      <div className="two-col">
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Parámetros operativos</h2>
              <p>Reglas de automatización del piloto CESFAM</p>
            </div>
            <SlidersHorizontal size={17} />
          </div>
          {options.map((item, idx) => (
            <div className="setting-row" key={item.title}>
              <div>
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences[idx]}
                disabled={!canEdit}
                style={{ opacity: canEdit ? 1 : 0.55, cursor: canEdit ? "pointer" : "not-allowed" }}
                className="toggle"
                onClick={() => {
                  if (!canEdit) return;
                  const next = preferences.map((v, i) => (i === idx ? !v : v));
                  setPreferences(next);
                  notify(`Preferencia «${item.title}» actualizada.`);
                }}
              />
            </div>
          ))}
        </section>
        <section className="card card-pad">
          <div className="section-title">
            <div>
              <h2>Control del entorno piloto</h2>
              <p>Administración de datos de prueba</p>
            </div>
          </div>
          {canEdit ? (
            <>
              <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                Si realizaste pruebas de check-in, lecturas del Tótem QR o ingresos de pacientes y deseas volver a la agenda base del CESFAM, presiona el botón inferior.
              </p>
              <button type="button" className="button warn" onClick={onReset}>
                <RefreshCw size={14} /> Reiniciar datos de demostración
              </button>
            </>
          ) : (
            <div className="inline-note" style={{ marginTop: 0 }}>
              <Lock size={15} />
              <span>Acción restringida: el reinicio de datos del entorno piloto solo puede ser ejecutado por Soporte TI.</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}