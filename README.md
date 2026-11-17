# B9 CRM

CRM interno de B9 Creative Studios: propuestas comerciales, clientes, renovaciones.

> Las instrucciones completas de instalación y despliegue (para alguien no técnico) llegan en la fase 5.

## Desarrollo local (resumen)

```bash
npm install
npx supabase start          # base de datos local (necesita Docker)
cp .env.example .env.local  # y rellena las claves que muestra el comando anterior
node --env-file=.env.local scripts/datos-demo.mjs   # datos de ejemplo (opcional)
npm run dev
```
