import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity, AlertTriangle, ArrowUpRight, CalendarDays, ChevronRight,
  CircleCheck, ClipboardCheck, Clock3, FileText, Headphones, LayoutDashboard,
  LockKeyhole, MessagesSquare, MoreHorizontal, Phone, PlugZap, Plus,
  Radio, ScanLine, Search, Settings2, ShieldAlert, ShieldCheck,
  SlidersHorizontal, UsersRound, WifiOff, X, Zap,
} from 'lucide-react';

type Appointment = {
  id: string; alias: string; time: string; service: string; status: string;
  channel: string; risk: number; riskReasons: string[];
};

type Communication = {
  alias: string; channel: string; time: string; intent: string;
  transcript: string; review: string;
};

type WaitlistEntry = { alias: string; priority: string; availability: string };

const initialAppointments: Appointment[] = [
];

const nav = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/appointments', label: 'Agenda y espera', icon: CalendarDays },
  { href: '/risk', label: 'Revisión de riesgo', icon: ShieldAlert },
  { href: '/communications', label: 'Comunicaciones', icon: MessagesSquare },
  { href: '/kiosk', label: 'Kiosco SOME', icon: ScanLine },
  { href: '/staff', label: 'Equipo y accesos', icon: UsersRound },
  { href: '/integrations', label: 'Conectores', icon: PlugZap },
  { href: '/reports', label: 'Indicadores', icon: Activity },
  { href: '/settings', label: 'Configuración', icon: Settings2 },
];

const pageInfo: Record<string, { title: string; subtitle: string; section: string }> = {
  '/': { title: 'Resumen operativo', subtitle: 'Consulta el estado de la agenda, los canales y los dispositivos del establecimiento.', section: 'Resumen' },
  '/appointments': { title: 'Agenda y lista de espera', subtitle: 'Administra las citas y los cupos disponibles.', section: 'Gestión de agenda' },
  '/risk': { title: 'Revisión de inasistencia', subtitle: 'Una señal orientativa para priorizar revisión humana, nunca una decisión automática.', section: 'Apoyo a la priorización' },
  '/communications': { title: 'Comunicaciones', subtitle: 'Revisa las confirmaciones recibidas por cada canal.', section: 'Canales de contacto' },
  '/kiosk': { title: 'Monitor del tótem', subtitle: 'Consulta el estado del dispositivo y los eventos de llegada.', section: 'Dispositivo presencial' },
  '/staff': { title: 'Equipo y accesos', subtitle: 'Administra las cuentas y los permisos del personal.', section: 'Administración del equipo' },
  '/integrations': { title: 'Integraciones', subtitle: 'Configura los servicios y dispositivos del sistema.', section: 'Conexiones' },
  '/reports': { title: 'Indicadores', subtitle: 'Consulta resultados de asistencia, confirmación y recuperación de cupos.', section: 'Reportes' },
  '/settings': { title: 'Configuración', subtitle: 'Define las preferencias operativas del sistema.', section: 'Preferencias' },
};

const initialCommunications: Communication[] = [];

const initialWaitlist: WaitlistEntry[] = [];

const statusClass = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.includes('error') || lower.includes('riesgo') || lower.includes('bloqueado')) return 'status missed';
  if (lower.includes('pendiente') || lower.includes('espera') || lower.includes('revisión')) return 'status pending';
  if (lower.includes('confirm') || lower.includes('activo') || lower.includes('revisado') || lower.includes('completado') || lower.includes('conectado')) return 'status';
  if (lower.includes('curso') || lower.includes('atención')) return 'status in-progress';
  return 'status neutral';
};

function Badge({ children }: { children: string }) {
  return <span className={statusClass(children)} data-testid={`status-${children.toLowerCase().replaceAll(' ', '-')}`}>{children}</span>;
}

export default function PortalPage() {
  const [path] = useLocation();
  const current = pageInfo[path] ? path : '/';
  const appointments = initialAppointments;
  const communications = initialCommunications;
  const waitlist = initialWaitlist;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [statusMessage, setStatusMessage] = useState('');
  const [preferences, setPreferences] = useState([false, false, false]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState('Hoy');
  const [showWaitlist, setShowWaitlist] = useState(true);

  const notify = (message: string) => {
    setStatusMessage(message);
  };
  const filteredAppointments = appointments.filter((item) => {
    const matchesQuery = `${item.alias} ${item.service} ${item.id}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'Todos' || item.status === filter;
    return matchesQuery && matchesFilter;
  });
  const filteredComms = communications.filter((item) =>
    `${item.alias} ${item.intent} ${item.channel}`.toLowerCase().includes(query.toLowerCase()),
  );

  const renderNavLink = (item: typeof nav[number], mobile = false) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={`nav-link${current === item.href ? ' active' : ''}`} aria-current={current === item.href ? 'page' : undefined} onClick={() => mobile && setMobileOpen(false)} data-testid={`link-nav-${item.href === '/' ? 'resumen' : item.href.slice(1)}`}>
        <Icon aria-hidden="true" /><span>{item.label}</span>
      </Link>
    );
  };

  const navLinks = () => <nav className="nav-list" aria-label="Navegación principal">{nav.map((item) => renderNavLink(item))}</nav>;
  const mobileNav = () => (
    <nav id="mobile-navigation" className={`mobile-nav${mobileOpen ? ' expanded' : ''}`} aria-label="Navegación móvil">
      {(mobileOpen ? nav : nav.slice(0, 4)).map((item) => renderNavLink(item, true))}
      <button className={`nav-link nav-more${!mobileOpen && nav.slice(0, 4).every((item) => item.href !== current) ? ' active' : ''}`} type="button" aria-label={mobileOpen ? 'Cerrar menú de navegación' : 'Ver más secciones'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)} data-testid="button-mobile-more">
        {mobileOpen ? <X aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}<span>{mobileOpen ? 'Cerrar' : 'Más'}</span>
      </button>
    </nav>
  );

  const head = pageInfo[current];
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">NZ</div>
          <div><strong>NSP-Zero</strong><small>Gestión operativa CESFAM</small></div>
        </div>
        <div className="nav-label">Espacio de trabajo</div>
        {navLinks()}
        <div className="sidebar-bottom">
          <div className="pilot-chip"><b>Plantilla operativa</b><span>Sin fuentes ni conexiones configuradas.</span></div>
        </div>
      </aside>
      <div className="main-shell">
        <main className={`content${mobileOpen ? ' menu-expanded' : ''}`}>
          <div className="page-head">
            <div><div className="eyebrow">{head.section}</div><h1>{head.title}</h1><p>{head.subtitle}</p></div>
            {current === '/appointments' && <div className="head-actions"><Link className="button primary" href="/integrations" data-testid="link-configure-agenda"><PlugZap />Configurar agenda</Link></div>}
          </div>
          {statusMessage && <div className="inline-feedback" role="status" data-testid="status-feedback">{statusMessage}</div>}
          {current === '/' && <Overview appointments={appointments} />}
          {current === '/appointments' && <Appointments appointments={filteredAppointments} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} dayFilter={dayFilter} setDayFilter={setDayFilter} waitlist={waitlist} showWaitlist={showWaitlist} setShowWaitlist={setShowWaitlist} />}
          {current === '/risk' && <Risk appointments={appointments} />}
          {current === '/communications' && <Communications items={filteredComms} query={query} setQuery={setQuery} />}
          {current === '/kiosk' && <Kiosk />}
          {current === '/staff' && <Staff />}
          {current === '/integrations' && <Integrations />}
          {current === '/reports' && <Reports />}
          {current === '/settings' && <Settings preferences={preferences} setPreferences={setPreferences} notify={notify} />}
        </main>
      </div>
      {mobileNav()}
    </div>
  );
}

function Overview({ appointments }: { appointments: Appointment[] }) {
  const next = appointments.filter((item) => item.time >= '09:00').slice(0, 4);
  return <>
    <div className="stats-grid">
      <Stat label="Citas en agenda" value="—" meta="Sin fuente conectada" icon={<CalendarDays />} />
      <Stat label="Por confirmar" value="—" meta="Sin datos disponibles" icon={<Clock3 />} />
      <Stat label="Lista de espera" value="—" meta="Sin datos disponibles" icon={<UsersRound />} />
      <Stat label="Tótem SOME" value="—" meta="Sin dispositivo conectado" icon={<ScanLine />} />
    </div>
    <div className="overview-grid">
      <section className="card card-pad">
        <div className="section-title"><div><h2>Próximas atenciones</h2><p>Agenda del establecimiento</p></div><Link href="/appointments" className="text-link">Ver agenda <ArrowUpRight size={13} /></Link></div>
        {next.length ? <div className="schedule-list">{next.map((item) => <div className="schedule-row" key={item.id} data-testid={`row-upcoming-${item.id}`}><div className="time">{item.time}</div><div><div className="person">{item.alias}</div><div className="subtext">{item.service} · {item.id}</div></div><Badge>{item.status}</Badge></div>)}</div> : <EmptyState icon={<CalendarDays />} title="Sin agenda conectada" description="Conecta una fuente de agenda para ver las próximas atenciones." />}
      </section>
      <section className="card card-pad">
        <div className="section-title"><div><h2>Accesos rápidos</h2><p>Módulos de trabajo</p></div></div>
        <div className="quick-list">
          <Link className="quick-item quick-link" href="/risk" data-testid="link-open-risk"><span className="quick-icon"><ShieldAlert /></span><span><b>Revisión de inasistencia</b><small>Evaluación por el equipo.</small></span><ChevronRight className="quick-arrow" /></Link>
          <Link className="quick-item quick-link" href="/communications" data-testid="link-open-communications"><span className="quick-icon"><MessagesSquare /></span><span><b>Comunicaciones</b><small>Confirmaciones y respuestas.</small></span><ChevronRight className="quick-arrow" /></Link>
          <Link className="quick-item quick-link" href="/kiosk" data-testid="link-open-kiosk"><span className="quick-icon"><ScanLine /></span><span><b>Monitor del tótem</b><small>Estado del dispositivo.</small></span><ChevronRight className="quick-arrow" /></Link>
        </div>
      </section>
    </div>
    <div className="two-col" style={{ marginTop: 16 }}>
      <section className="card card-pad"><div className="section-title"><div><h2>Actividad reciente</h2><p>Eventos del sistema</p></div></div>
        <EmptyState icon={<Activity />} title="Fuente de actividad sin conectar" description="Los eventos se mostrarán cuando la fuente esté disponible." compact />
      </section>
      <section className="card card-pad"><div className="section-title"><div><h2>Estado de conexiones</h2><p>Servicios requeridos</p></div><Link href="/integrations" className="text-link">Ver conexiones</Link></div>
        <div className="metric"><span>Mensajería y voz</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Registro clínico</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Tótem presencial</span><Badge>Sin configurar</Badge></div>
      </section>
    </div>
  </>;
}

function Stat({ label, value, meta, icon }: { label: string; value: string; meta: string; icon: ReactNode }) {
  return <div className="card stat-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-meta">{meta}</div><span style={{ position: 'absolute', right: 14, top: 14, color: '#64748B' }}>{icon}</span></div>;
}

function EmptyState({ icon, title, description, compact = false }: { icon: ReactNode; title: string; description: string; compact?: boolean }) {
  return <div className={`empty-state${compact ? ' compact' : ''}`}><span className="empty-icon">{icon}</span><strong>{title}</strong><span>{description}</span></div>;
}

function Appointments({ appointments, query, setQuery, filter, setFilter, dayFilter, setDayFilter, waitlist, showWaitlist, setShowWaitlist }: {
  appointments: Appointment[]; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void;
  dayFilter: string; setDayFilter: (value: string) => void;
  waitlist: WaitlistEntry[]; showWaitlist: boolean; setShowWaitlist: (value: boolean) => void;
}) {
  return <div className="two-col">
    <section className="card card-pad">
      <div className="section-title"><div><h2>Citas de la jornada</h2><p>Agenda del establecimiento</p></div><Badge>Sin datos</Badge></div>
      <div className="toolbar">
        <div className="search-wrap"><Search aria-hidden="true" /><input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alias, servicio o código" aria-label="Buscar citas" data-testid="input-search-appointments" /></div>
        <select className="control" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar estado" data-testid="select-appointment-status"><option>Todos</option><option>Confirmada</option><option>Por confirmar</option><option>En espera</option></select>
        <select className="control" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} aria-label="Elegir jornada" data-testid="select-appointment-day"><option>Hoy</option><option>Mañana</option><option>Esta semana</option></select>
      </div>
      <div className="table-wrap"><table className="data-table appointments-table"><thead><tr><th>Hora / alias</th><th>Servicio</th><th>Estado</th><th>Canal</th><th>Acción</th></tr></thead><tbody>{appointments.map((item) => <tr key={item.id} data-testid={`row-appointment-${item.id}`}><td><div className="person">{item.time} · {item.alias}</div><div className="subtext">{item.id}</div></td><td>{item.service}</td><td><Badge>{item.status}</Badge></td><td>{item.channel}</td><td /></tr>)}</tbody></table>
        {appointments.length === 0 && <EmptyState icon={<CalendarDays />} title="Agenda sin conectar" description="Conecta una agenda para consultar y gestionar las atenciones." />}</div>
    </section>
    <section className="card card-pad">
      <div className="section-title"><div><h2>Lista de espera</h2><p>Cupos y disponibilidad</p></div><button className="icon-button" onClick={() => setShowWaitlist(!showWaitlist)} aria-label={showWaitlist ? 'Contraer lista de espera' : 'Expandir lista de espera'} data-testid="button-toggle-waitlist">{showWaitlist ? <X size={16} /> : <Plus size={16} />}</button></div>
      {showWaitlist && <EmptyState icon={<UsersRound />} title={waitlist.length ? 'Cupos disponibles' : 'Lista sin fuente conectada'} description={waitlist.length ? 'La disponibilidad aparecerá aquí.' : 'Los cupos y las solicitudes aparecerán aquí cuando se conecten las fuentes.'} />}
      {!showWaitlist && <EmptyState icon={<UsersRound />} title="Lista contraída" description="Expande esta sección para consultar disponibilidad." compact />}
    </section>
  </div>;
}

function Risk({ appointments }: { appointments: Appointment[] }) {
  const highRisk = appointments.filter((item) => item.risk >= 50).sort((a, b) => b.risk - a.risk);
  return <>
    <div className="banner caution"><AlertTriangle /><div><strong>Revisión humana obligatoria</strong>Las señales de inasistencia son apoyo operativo; no deben determinar el acceso a una atención.</div></div>
    <div className="stats-grid"><Stat label="Casos por revisar" value={highRisk.length ? String(highRisk.length) : '—'} meta="Sin datos disponibles" icon={<ShieldAlert />} /><Stat label="Citas evaluadas" value={appointments.length ? String(appointments.length) : '—'} meta="Sin agenda conectada" icon={<ClipboardCheck />} /><Stat label="Modelo predictivo" value="—" meta="Sin configurar" icon={<PlugZap />} /><Stat label="Decisión final" value="Equipo SOME" meta="Revisión humana" icon={<UsersRound />} /></div>
    <section className="card card-pad"><div className="section-title"><div><h2>Casos por revisar</h2><p>Señales y motivos se mostrarán al conectar un modelo validado.</p></div><Badge>Revisión humana</Badge></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Alias / cita</th><th>Señal de riesgo</th><th>Motivos</th><th>Estado de agenda</th><th>Revisión</th></tr></thead><tbody>{highRisk.map((item) => <tr key={item.id} data-testid={`row-risk-${item.id}`}><td><div className="person">{item.alias}</div><div className="subtext">{item.time} · {item.service}</div></td><td><div className="risk-meter"><div className="risk-bar"><i style={{ width: `${item.risk}%` }} /></div><b>{item.risk}/100</b></div></td><td>{item.riskReasons.join(' · ')}</td><td><Badge>{item.status}</Badge></td><td>Revisión humana</td></tr>)}</tbody></table>
        {!highRisk.length && <EmptyState icon={<ShieldAlert />} title="Agenda y modelo sin conectar" description="Conecta fuentes autorizadas para mostrar casos y señales de revisión." />}
      </div>
    </section>
  </>;
}

function Communications({ items, query, setQuery }: { items: Communication[]; query: string; setQuery: (value: string) => void }) {
  const [intentFilter, setIntentFilter] = useState('Todas');
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [detailsOpen, setDetailsOpen] = useState<string[]>([]);
  const visible = items.filter((item) =>
    (intentFilter === 'Todas' || item.intent === intentFilter) &&
    `${item.alias} ${item.intent} ${item.channel}`.toLowerCase().includes(query.toLowerCase()),
  );
  return <div className="two-col">
    <section className="card card-pad"><div className="section-title"><div><h2>Mensajes y llamadas</h2><p>Confirmaciones y solicitudes recibidas</p></div><Badge>Sin actividad</Badge></div>
      <div className="toolbar"><div className="search-wrap"><Search /><input className="control" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar comunicaciones" placeholder="Buscar alias o intención" data-testid="input-search-communications" /></div><select className="control" value={intentFilter} onChange={(e) => setIntentFilter(e.target.value)} aria-label="Filtrar intención" data-testid="select-intent"><option>Todas</option><option>Solicita reagendar</option><option>Confirma asistencia</option><option>Sin respuesta</option><option>Consulta horario</option></select></div>
      <div className="schedule-list">{visible.map((item) => { const reviewedLocally = reviewed.includes(item.time); const showDetails = detailsOpen.includes(item.time); return <article className="quick-item message-card" key={`${item.alias}-${item.time}`} data-testid={`card-message-${item.time}`}><span className="quick-icon">{item.channel.includes('Audio') ? <Headphones /> : item.channel.includes('Llamada') ? <Phone /> : <MessagesSquare />}</span><div className="message-card-content"><div className="message-card-head"><b>{item.alias} · {item.channel}</b><span className="feed-time">{item.time}</span><Badge>{reviewedLocally ? 'Revisado' : item.review}</Badge></div><div className="subtext" style={{ marginTop: 7 }}>Intención sugerida: {item.intent}</div><p className="message-transcript">{item.transcript}</p>{showDetails && <div className="inline-note">Canal de origen: {item.channel} · Estado: {reviewedLocally ? 'Revisado' : item.review}</div>}<div className="message-card-actions"><button className="button tiny ghost" type="button" aria-expanded={showDetails} onClick={() => setDetailsOpen((current) => current.includes(item.time) ? current.filter((time) => time !== item.time) : [...current, item.time])}>{showDetails ? 'Ocultar detalles' : 'Ver detalles'}</button><button className="button tiny" type="button" onClick={() => setReviewed((current) => current.includes(item.time) ? current : [...current, item.time])}>{reviewedLocally ? 'Revisado' : 'Marcar revisado'}</button></div></div></article>; })}</div>
      {visible.length === 0 && <EmptyState icon={<MessagesSquare />} title="Canales sin configurar" description="Conecta los canales para mostrar mensajes y llamadas recibidas." />}
    </section>
    <div>
      <section className="card card-pad"><div className="section-title"><div><h2>Canales</h2><p>Estado de conexión</p></div></div><div className="metric"><span>WhatsApp</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Audio entrante</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Llamadas</span><Badge>Sin configurar</Badge></div></section>
      <section className="card card-pad" style={{ marginTop: 15 }}><div className="section-title"><div><h2>Revisión responsable</h2></div></div><div className="quick-list"><div className="quick-item compact-note"><EyeIcon /><span><b>Revisa la intención antes de responder.</b></span></div><div className="quick-item compact-note"><LockKeyhole /><span><b>Limita el acceso a personal autorizado.</b></span></div></div></section>
    </div>
  </div>;
}

function EyeIcon() { return <ShieldCheck />; }

function Kiosk() {
  return <>
    <div className="banner"><ScanLine /><div><strong>Vista para personal SOME</strong>Estado del tótem y recepción de eventos de llegada.</div></div>
    <div className="two-col">
      <section className="card card-pad"><div className="section-title"><div><h2>Conexión del tótem</h2><p>ESP32 · MQTT seguro</p></div><Badge>Sin configurar</Badge></div>
        <div className="three-col">
          <div className="quick-item"><span className="quick-icon"><WifiOff /></span><span><small>Conexión</small><b>No conectado</b></span></div>
          <div className="quick-item"><span className="quick-icon"><Radio /></span><span><small>Latencia</small><b>—</b></span></div>
          <div className="quick-item"><span className="quick-icon"><Clock3 /></span><span><small>Último evento</small><b>—</b></span></div>
        </div>
        <Link className="button secondary-action" href="/integrations" data-testid="link-configure-kiosk"><PlugZap />Configurar conexión</Link>
      </section>
      <section className="card card-pad"><div className="section-title"><div><h2>Eventos de llegada</h2><p>Registro de marcaciones recibidas</p></div></div>
        <EmptyState icon={<ScanLine />} title="Tótem sin conectar" description="Configura el dispositivo para recibir y mostrar marcaciones." />
      </section>
    </div>
    <section className="card card-pad section-spacer"><div className="section-title"><div><h2>Lector de identidad</h2><p>Estado de integración</p></div><Badge>Sin configurar</Badge></div><EmptyState icon={<LockKeyhole />} title="Lector no conectado" description="La lectura de documentos requiere hardware y autorización configurados." compact /></section>
  </>;
}

function Staff() {
  return <div className="two-col"><section className="card card-pad"><div className="section-title"><div><h2>Cuentas del equipo</h2><p>Usuarios con acceso al sistema</p></div><Badge>Sin configurar</Badge></div>
    <div className="table-wrap"><table className="data-table staff-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Último acceso</th></tr></thead><tbody /></table><EmptyState icon={<UsersRound />} title="Autenticación sin configurar" description="Conecta un servicio de identidad para consultar las cuentas del equipo." /></div>
    </section><section className="card card-pad"><div className="section-title"><div><h2>Roles y permisos</h2><p>Perfiles de acceso por función</p></div></div><div className="metric"><span>Administración SOME</span><b>Agenda y operación</b></div><div className="metric"><span>Admisión</span><b>Agenda y llegada</b></div><div className="metric"><span>Coordinación clínica</span><b>Revisión y seguimiento</b></div><div className="metric"><span>Consulta</span><b>Solo lectura</b></div><div className="inline-note"><LockKeyhole size={15} />Los permisos estarán disponibles al configurar autenticación.</div></section></div>;
}

function Integrations() {
  const items = [
    { name: 'IA predictiva · XGBoost', scope: 'Clasificación de riesgo de inasistencia', icon: Zap },
    { name: 'WhatsApp Business', scope: 'Confirmación y cancelación de citas', icon: MessagesSquare },
    { name: 'IA conversacional', scope: 'Procesamiento de texto y audio', icon: Headphones },
    { name: 'RCE · Rayen / AVIS', scope: 'Sincronización con agenda clínica', icon: FileText },
    { name: 'MQTT · ESP32', scope: 'Eventos de llegada desde el tótem', icon: Radio },
  ];
  return <>
    <div className="three-col">{items.map((item, index) => { const Icon = item.icon; return <section className="card connector" key={item.name} data-testid={`card-connector-${index}`}><div className="connector-top"><div className="connector-icon"><Icon /></div><Badge>Sin configurar</Badge></div><h3 style={{ marginTop: 13 }}>{item.name}</h3><p>{item.scope}</p><small>Estado: pendiente de conexión</small></section>; })}</div>
    <section className="card card-pad section-spacer"><div className="section-title"><div><h2>Requisitos de conexión</h2><p>Antes de habilitar un servicio</p></div></div><div className="metric"><span>Autorización institucional</span><Badge>Requerida</Badge></div><div className="metric"><span>Credenciales y endpoints</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Prueba y validación</span><Badge>Pendiente</Badge></div></section>
  </>;
}

function Reports() {
  return <>
    <div className="stats-grid"><Stat label="Tasa de confirmación" value="—" meta="Sin datos" icon={<CircleCheck />} /><Stat label="Inasistencia" value="—" meta="Sin datos" icon={<AlertTriangle />} /><Stat label="Cupos recuperados" value="—" meta="Sin datos" icon={<CalendarDays />} /><Stat label="Tiempo de respuesta" value="—" meta="Sin datos" icon={<Clock3 />} /></div>
    <div className="two-col"><section className="card card-pad"><div className="section-title"><div><h2>Resultados por período</h2><p>Asistencia y recuperación de cupos</p></div></div><EmptyState icon={<Activity />} title="Sin resultados disponibles" description="Los indicadores aparecerán al conectar los datos de operación." /></section>
      <section className="card card-pad"><div className="section-title"><div><h2>Indicadores disponibles</h2><p>Métricas de seguimiento</p></div></div><div className="metric"><span>Confirmaciones por canal</span><Badge>Sin datos</Badge></div><div className="metric"><span>Inasistencias por servicio</span><Badge>Sin datos</Badge></div><div className="metric"><span>Cupos reasignados</span><Badge>Sin datos</Badge></div><div className="metric"><span>Latencia de marcación</span><Badge>Sin datos</Badge></div></section></div>
  </>;
}

function Settings({ preferences, setPreferences, notify }: { preferences: boolean[]; setPreferences: (value: boolean[]) => void; notify: (text: string) => void }) {
  const options = [
    { title: 'Enviar recordatorios de cita', detail: 'Configura la anticipación y el canal de envío.' },
    { title: 'Solicitar confirmación de asistencia', detail: 'Define las respuestas aceptadas por canal.' },
    { title: 'Procesar respuestas de audio', detail: 'Requiere un servicio de voz autorizado.' },
  ];
  return <div className="two-col"><section className="card card-pad"><div className="section-title"><div><h2>Preferencias operativas</h2><p>Parámetros de comunicación y atención</p></div><SlidersHorizontal size={17} /></div>
    <div className="setting-row"><div><b>Anticipación de recordatorio</b><small>Tiempo antes de la cita</small></div><select className="control setting-select" aria-label="Anticipación de recordatorio" data-testid="select-reminder-time"><option>Seleccionar</option><option>24 horas</option><option>48 horas</option><option>72 horas</option></select></div>
    {options.map((item, index) => <div className="setting-row" key={item.title}><div><b>{item.title}</b><small>{item.detail}</small></div><button type="button" role="switch" aria-checked={preferences[index]} className="toggle" aria-label={item.title} onClick={() => { setPreferences(preferences.map((value, i) => i === index ? !value : value)); notify(`${item.title}: cambio sin guardar.`); }} data-testid={`switch-setting-${index}`} /></div>)}
    <div className="inline-note"><Settings2 size={15} />Las preferencias se guardarán al conectar el servicio de configuración.</div>
  </section><section className="card card-pad"><div className="section-title"><div><h2>Estado de la plantilla</h2><p>Requisitos de puesta en marcha</p></div></div><div className="metric"><span>Fuente de agenda</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Autenticación del equipo</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Canales de contacto</span><Badge>Sin configurar</Badge></div><div className="metric"><span>Dispositivo presencial</span><Badge>Sin configurar</Badge></div><Link className="button secondary-action section-spacer" href="/integrations"><PlugZap />Revisar integraciones</Link></section></div>;
}
