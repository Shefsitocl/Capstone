# NSP-Zero · Gestión CESFAM

Prototipo operacional para que equipos SOME de CESFAM gestionen citas, confirmaciones, señales de inasistencia y monitoreo de llegada.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nsp-zero/src/pages/portal.tsx` — pantallas operativas y estados vacíos de la plantilla.
- `artifacts/nsp-zero/src/index.css` — estilos y adaptación a pantallas pequeñas.
- La vista actual no usa API ni persistencia; sus estados son locales a la sesión.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

NSP-Zero es una interfaz para personal de CESFAM, especialmente equipos SOME; no es un portal para pacientes. Incluye resumen operativo, agenda y lista de espera, revisión humana de señales de NSP, comunicaciones, monitor del tótem, cuentas internas, conectores, indicadores y preferencias. Su público y flujo principal son internos.

La aplicación queda como plantilla sin registros ni cuentas de ejemplo. WhatsApp, IA, RCE Rayen/AVIS, MQTT y el lector del tótem están sin configurar; no se conectan servicios ni se ingresan documentos o datos clínicos reales.

La interfaz usa una paleta SaaS neutra, superficies blancas y navegación oscura compacta. No añadir una barra superior persistente ni puntos decorativos en las etiquetas de estado; conservar navegación móvil inferior, diseño adaptable y evitar pop-ups intrusivos o animaciones llamativas.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
