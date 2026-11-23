-- ============================================================================
-- KURA · DDL POSTGRESQL PARA NEON (BASE PRINCIPAL DEL PROYECTO)
-- Todas las tablas usan IF NOT EXISTS: ejecutarlo múltiples veces es seguro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  rut TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  unit TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  rut TEXT UNIQUE NOT NULL,
  rayen_ficha TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  age INT NOT NULL,
  gender TEXT NOT NULL,
  phone TEXT NOT NULL,
  sector TEXT NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL,
  fonasa_tramo TEXT NOT NULL,
  preferential_law BOOLEAN NOT NULL DEFAULT FALSE,
  chronic_program TEXT,
  total_appointments INT NOT NULL DEFAULT 0,
  nsp_history_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  professional_name TEXT NOT NULL,
  box_number TEXT NOT NULL,
  day_label TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 20,
  risk_reasons TEXT[] NOT NULL DEFAULT '{}',
  checkin_source TEXT,
  checkin_at TIMESTAMP,
  checkin_latency_ms INT
);

CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  priority_score INT NOT NULL,
  clinical_note TEXT NOT NULL,
  preferred_shift TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Disponible',
  assigned_appointment_id TEXT
);

CREATE TABLE IF NOT EXISTS connector_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  endpoint_url TEXT NOT NULL DEFAULT '',
  auth_token TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Sin configurar',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ml_prediction_logs (
  id SERIAL PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  patient_rut TEXT NOT NULL,
  probability_nsp DOUBLE PRECISION NOT NULL,
  risk_score INT NOT NULL,
  risk_level TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'XGBoost-APS-v1.3',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communications (
  id SERIAL PRIMARY KEY,
  appointment_id TEXT,
  patient_id INT NOT NULL,
  channel TEXT NOT NULL,
  time_label TEXT NOT NULL,
  intent TEXT NOT NULL,
  transcript TEXT NOT NULL,
  root_cause TEXT,
  vulnerability_alert BOOLEAN NOT NULL DEFAULT FALSE,
  review_status TEXT NOT NULL DEFAULT 'Pendiente'
);

CREATE TABLE IF NOT EXISTS iot_totem_events (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  hardware_type TEXT NOT NULL,
  qr_raw_payload TEXT NOT NULL,
  rut_extracted TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  appointment_id TEXT,
  latency_ms INT NOT NULL,
  offline_buffered BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'VALIDADO',
  created_at TIMESTAMP DEFAULT NOW()
);
