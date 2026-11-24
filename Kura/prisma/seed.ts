import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Sembrando datos clínicos Kura en Neon PostgreSQL...");

  // Puedes editar aquí los correos y contraseñas institucionales antes de ejecutar npm run db:seed
const staffData = [
  { email: "some@cesfam.cl", password: "cesfam2026", fullName: "Camila Valdés Rojas", rut: "17.845.210-3", role: "ADMINISTRACIÓN SOME", unit: "Ventanilla Central SOME · Providencia" },
  { email: "odontologia@cesfam.cl", password: "cesfam2026", fullName: "Dr. Sebastián Garay P.", rut: "15.290.441-8", role: "ODONTOLOGÍA / BOX", unit: "Unidad Dental · Box 3 y 4" },
  { email: "coordinacion@cesfam.cl", password: "cesfam2026", fullName: "Dra. Paulina Contreras M.", rut: "13.904.112-K", role: "COORDINACIÓN CLÍNICA", unit: "Dirección Técnica APS" },
  { email: "matias.munoz@cesfam.cl", password: "cesfam2026", fullName: "Matías Muñoz · Soporte TI - Infraestructura Digital & ESP32", rut: "19.412.670-5", role: "SOPORTE IOT / TÓTEM", unit: "Infraestructura Digital & ESP32" },
  { email: "martin.riquelme@cesfam.cl", password: "cesfam2026", fullName: "Martín Riquelme- Soporte IoT & Telemetría ESP32", rut: "20.145.890-0", role: "SOPORTE IOT / TÓTEM", unit: "Soporte IoT & Telemetría ESP32" },
  { email: "alonso.sanchez@cesfam.cl", password: "cesfam2026", fullName: "Alonso Sánchez - Soporte IoT & Redes CESFAM", rut: "20.489.312-8", role: "SOPORTE IOT / TÓTEM", unit: "Soporte IoT & Redes CESFAM" },
  { email: "nicole.moreno@cesfam.cl", password: "cesfam2026", fullName: "Nicole Moreno - Soporte Tótem SOME & Acreditación", rut: "20.763.419-0", role: "SOPORTE IOT / TÓTEM", unit: "Soporte Tótem SOME & Acreditación" },
];

  for (const s of staffData) {
    await prisma.staffUser.upsert({ where: { email: s.email }, update: s, create: s });
  }

  const patientsSeed = [
    { rut: "6.412.890-4", rayenFicha: "RYN-10421", fullName: "Rosa Elena Morales Soto", age: 74, gender: "F", phone: "+56 9 8412 3301", sector: "Sector Azul", distanceKm: 1.4, fonasaTramo: "B", preferentialLaw: true, chronicProgram: "Salud Oral Adulto Mayor", totalAppointments: 14, nspHistoryCount: 1 },
    { rut: "15.432.890-K", rayenFicha: "RYN-20894", fullName: "Carlos Alberto Fuentes Vera", age: 42, gender: "M", phone: "+56 9 7621 9044", sector: "Sector Verde", distanceKm: 4.8, fonasaTramo: "C", preferentialLaw: false, chronicProgram: "Odontología Integral", totalAppointments: 9, nspHistoryCount: 4 },
    { rut: "8.910.334-2", rayenFicha: "RYN-11902", fullName: "Héctor Manuel Tapia Díaz", age: 69, gender: "M", phone: "+56 9 6543 1189", sector: "Sector Azul", distanceKm: 2.1, fonasaTramo: "A", preferentialLaw: true, chronicProgram: "Cardiovascular + Dental", totalAppointments: 18, nspHistoryCount: 2 },
    { rut: "18.234.567-1", rayenFicha: "RYN-33018", fullName: "Valentina Paz Rojas Lagos", age: 29, gender: "F", phone: "+56 9 9120 4455", sector: "Sector Rojo", distanceKm: 5.2, fonasaTramo: "D", preferentialLaw: false, chronicProgram: null, totalAppointments: 6, nspHistoryCount: 3 },
    { rut: "7.320.118-9", rayenFicha: "RYN-14520", fullName: "Marta Eugenia Castro Pinto", age: 78, gender: "F", phone: "+56 9 5210 8874", sector: "Sector Verde", distanceKm: 3.9, fonasaTramo: "B", preferentialLaw: true, chronicProgram: "Movilidad Reducida", totalAppointments: 22, nspHistoryCount: 6 },
    { rut: "16.789.012-5", rayenFicha: "RYN-28411", fullName: "Ignacio Andrés Soto Herrera", age: 36, gender: "M", phone: "+56 9 8877 6655", sector: "Sector Azul", distanceKm: 1.8, fonasaTramo: "C", preferentialLaw: false, chronicProgram: "Endodoncia", totalAppointments: 7, nspHistoryCount: 0 },
  ];

  const createdPatients: Record<string, number> = {};
  for (const p of patientsSeed) {
    const rec = await prisma.patient.upsert({ where: { rut: p.rut }, update: p, create: p });
    createdPatients[p.rut] = rec.id;
  }

  const appointmentsSeed = [
    { id: "RYN-2026-8841", patientId: createdPatients["6.412.890-4"], specialty: "Odontología General", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "08:30", status: "Presente en sala", channel: "Tótem QR", riskScore: 14, riskReasons: ["Adulto mayor adherente", "Ley Preferente 20.584"], checkinSource: "TOTEM_ESP32_QR", checkinLatencyMs: 214 },
    { id: "RYN-2026-8842", patientId: createdPatients["15.432.890-K"], specialty: "Endodoncia", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "09:00", status: "Por confirmar", channel: "WhatsApp Bot", riskScore: 78, riskReasons: ["44% tasa histórica NSP", "Distancia 4.8 km", "Sin respuesta T-24h"], checkinSource: null, checkinLatencyMs: null },
    { id: "RYN-2026-8843", patientId: createdPatients["8.910.334-2"], specialty: "Control Salud Oral", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Hoy", scheduledTime: "09:30", status: "Confirmada", channel: "Voz Telefónica", riskScore: 22, riskReasons: ["Confirmado vía llamada T-24h"], checkinSource: null, checkinLatencyMs: null },
    { id: "RYN-2026-8844", patientId: createdPatients["18.234.567-1"], specialty: "Odontología General", professionalName: "Dra. Carolina Vega L.", boxNumber: "Box Dental 4", dayLabel: "Hoy", scheduledTime: "10:00", status: "Por confirmar", channel: "Audio WhatsApp", riskScore: 71, riskReasons: ["50% NSP previo", "Distancia 5.2 km"], checkinSource: null, checkinLatencyMs: null },
    { id: "RYN-2026-8845", patientId: createdPatients["7.320.118-9"], specialty: "Prótesis Dental", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "10:30", status: "Cancelada", channel: "Audio WhatsApp", riskScore: 84, riskReasons: ["Barrera movilidad reportada", "Alerta Ley Preferente"], checkinSource: null, checkinLatencyMs: null },
    { id: "RYN-2026-8846", patientId: createdPatients["16.789.012-5"], specialty: "Endodoncia", professionalName: "Dr. Sebastián Muñoz P.", boxNumber: "Box Dental 3", dayLabel: "Hoy", scheduledTime: "11:00", status: "Confirmada", channel: "WhatsApp Bot", riskScore: 11, riskReasons: ["0% NSP histórico", "Confirmado 1-clic"], checkinSource: null, checkinLatencyMs: null },
  ];

  for (const a of appointmentsSeed) {
    await prisma.appointment.upsert({ where: { id: a.id }, update: a, create: a });
  }

  console.log("Seed Kura en Neon PostgreSQL completado correctamente.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
