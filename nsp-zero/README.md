# Kura · Gestión Predictiva, Omnicanal y Check-In IoT para CESFAM

Plataforma clínica integral para Atención Primaria de Salud (APS / CESFAM) con validación real de cédula de identidad chilena (Módulo 11 + QR SIDIV Registro Civil), cálculo de riesgo NSP (XGBoost), IA conversacional omnicanal, control de acceso por roles (RBAC) y soporte para datos reales junto a registros clínicos precargados.

## Ejecución rápida en local

1. Instala dependencias (si es una carpeta nueva):
   ```bash
   npm install
   ```
2. Inicia el servidor API + interfaz web:
   ```bash
   npm run dev
   ```
3. Abre **`http://localhost:5173`** en tu navegador.
   *(Las cuentas institucionales están definidas en `server/store.ts` y `prisma/seed.ts`).*

## Permisos por Rol (RBAC)
- **Administración SOME** y **Odontología / Box**: Operación clínica de agenda, acreditación, lista de espera, comunicaciones y Tótem (sin acceso a Conectores ni Configuración operativa).
- **Coordinación Clínica**: Acceso de **solo lectura** en Conectores y Configuración operativa.
- **Soporte IoT / Tótem**: Administración completa de Conectores, API Keys y Configuración operativa.
