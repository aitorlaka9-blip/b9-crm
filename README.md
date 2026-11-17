# B9 CRM

CRM interno de **B9 Creative Studios**: propuestas comerciales, clientes, renovaciones y facturación recurrente.

- Cada propuesta se sube (o entra sola desde Drive) y la IA rellena sus datos.
- **Aceptada** → se crea o actualiza la ficha del cliente. **Denegada** → motivo obligatorio.
- Avisos de seguimiento a los 7 y 30 días y de renovación a los 30, 15 y 7 días (en la app y por email).
- Panel con MRR frente al objetivo, tasas de cierre y de renovación, motivos de rechazo y rendimiento por vendedor.
- Roles: **Dirección** (todo), **Comercial** (propuestas y clientes), **Equipo** (solo sus clientes, sin importes).

Funciona en el móvil y en el ordenador. Todo el texto está en español.

---

## Índice

1. [Qué hace falta](#1-qué-hace-falta)
2. [Base de datos (Supabase)](#2-base-de-datos-supabase)
3. [Entrar con Google](#3-entrar-con-google)
4. [Publicar la web (Vercel)](#4-publicar-la-web-vercel)
5. [Dominio crm.b9studios.com](#5-dominio-crmb9studioscom)
6. [Emails (Resend)](#6-emails-resend)
7. [Primer acceso](#7-primer-acceso)
8. [Importar las propuestas antiguas](#8-importar-las-propuestas-antiguas)
9. [Propuestas automáticas desde Google Drive](#9-propuestas-automáticas-desde-google-drive)
10. [Uso diario](#10-uso-diario)
11. [Problemas frecuentes](#11-problemas-frecuentes)
12. [Para desarrolladores](#12-para-desarrolladores)

---

## 1. Qué hace falta

| Servicio | Para qué | Coste aproximado |
|---|---|---|
| **GitHub** | Guarda el código | Gratis |
| **Supabase** | Base de datos, login y archivos | Plan Pro, 25 $/mes (el gratuito se pausa si no se usa en 7 días) |
| **Vercel** | Publica la web | Gratis (plan Hobby) |
| **Anthropic** (platform.claude.com) | La IA que lee las propuestas | Pago por uso, céntimos por propuesta |
| **Resend** | Envía los emails de aviso | Gratis hasta 3.000 emails/mes |
| **Google Cloud** | El botón "Entrar con Google" | Gratis |

Lo más cómodo es crear Supabase, Vercel y Resend con el botón **"Continuar con GitHub"**.

---

## 2. Base de datos (Supabase)

1. Entra en https://supabase.com/dashboard → **New project**.
   - Nombre: `b9-crm`
   - Región: **Central EU (Frankfurt)**
   - Contraseña de la base de datos: genera una y guárdala en tu gestor de contraseñas.
2. Cuando termine de crearse (1–2 minutos), ve a **SQL Editor** → **New query**.
3. Abre el archivo [`supabase/instalar.sql`](supabase/instalar.sql) de este repositorio, copia **todo** su contenido, pégalo y pulsa **Run**. Debe terminar con "Success".
4. Ve a **Project Settings → API** y apunta estos tres valores (los usarás en Vercel):
   - **Project URL** → será `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (pulsa "Reveal") → será `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Es secreta: no la compartas ni la pegues en ningún chat.
5. Ve a **Authentication → URL Configuration**:
   - **Site URL**: `https://crm.b9studios.com`
   - **Redirect URLs**: añade `https://crm.b9studios.com/auth/callback` y también `https://*.vercel.app/auth/callback`

---

## 3. Entrar con Google

1. Entra en https://console.cloud.google.com con tu cuenta de Google → crea un proyecto llamado `B9 CRM`.
2. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo** (o **Interno** si todo el equipo usa cuentas `@b9studios.com`).
   - Nombre de la app: `B9 CRM`, y tu email de soporte. Guarda.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**
   - **URI de redireccionamiento autorizados**: la que te da Supabase en **Authentication → Sign In / Providers → Google** (tiene la forma `https://XXXX.supabase.co/auth/v1/callback`).
   - Crear. Copia el **ID de cliente** y el **Secreto del cliente**.
4. En Supabase → **Authentication → Sign In / Providers → Google**: actívalo y pega el ID y el secreto. Guarda.
5. Si elegiste "Externo", vuelve a la pantalla de consentimiento y pulsa **Publicar app** (si no, solo podrán entrar los usuarios de prueba que añadas).

> Aunque cualquiera con Google pueda llegar al botón, **solo entran las personas invitadas** desde Ajustes. El resto ve "Tu cuenta todavía no tiene acceso".

---

## 4. Publicar la web (Vercel)

1. En https://vercel.com → **Add New… → Project** → importa el repositorio `b9-crm` de GitHub.
2. Antes de pulsar Deploy, abre **Environment Variables** y añade:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de Supabase |
| `ANTHROPIC_API_KEY` | tu clave de platform.claude.com → API Keys |
| `NEXT_PUBLIC_SITE_URL` | `https://crm.b9studios.com` |
| `CRON_SECRET` | un texto largo inventado (p. ej. de https://1password.com/password-generator, 40 caracteres) |
| `INGESTA_SECRET` | otro texto largo inventado, distinto (lo usará el script de Drive) |
| `RESEND_API_KEY` | se añade en el paso 6 |
| `EMAIL_REMITENTE` | `B9 CRM <avisos@b9studios.com>` |

   **No añadas** `NEXT_PUBLIC_DEV_LOGIN` (es solo para pruebas en local).

3. Pulsa **Deploy**. En 2–3 minutos tendrás una dirección `https://b9-crm-xxxx.vercel.app`.
4. La comprobación diaria (renovaciones, bajas, avisos) se activa sola: viene configurada en `vercel.json` y se ejecuta cada mañana a las 7:00 (8:00 en verano), hora de Madrid. La verás en Vercel → **Settings → Cron Jobs**.

Cada vez que se sube código nuevo a GitHub, Vercel publica la nueva versión automáticamente.

---

## 5. Dominio crm.b9studios.com

1. En Vercel → tu proyecto → **Settings → Domains** → añade `crm.b9studios.com`.
2. Vercel te mostrará un registro **CNAME** (normalmente `cname.vercel-dns.com`).
3. Entra en el panel donde gestionáis el dominio `b9studios.com` (GoDaddy, IONOS, Google Domains/Squarespace, Cloudflare…) → DNS → añade:
   - Tipo: `CNAME` · Nombre/Host: `crm` · Valor: el que indique Vercel
4. En unos minutos (a veces hasta 1 hora) Vercel lo marcará como válido y pondrá el certificado HTTPS.

---

## 6. Emails (Resend)

1. En https://resend.com → **Domains → Add domain** → `b9studios.com` (región EU).
2. Resend te dará 3 o 4 registros DNS (tipo TXT y MX). Añádelos en el mismo panel del dominio que en el paso 5, tal cual.
3. Cuando aparezca **Verified**, ve a **API Keys → Create API key** (permiso "Sending access").
4. Pégala en Vercel como `RESEND_API_KEY` → **Deployments → … → Redeploy** para que la use.

Sin esta clave el CRM funciona igual, pero los emails no se envían (quedan registrados como "simulados").

---

## 7. Primer acceso

1. Abre `https://crm.b9studios.com` y pulsa **Entrar con Google**.
2. **La primera persona que entra se convierte en Dirección.** Entra tú antes que nadie.
3. En **Ajustes**:
   - **Equipo interno**: añade a las personas de B9 y de ABX con su email (los de ABX con la etiqueta "ABX"). Así podrás asignarlas como responsables y recibirán los avisos de renovación.
   - **Acceso al CRM**: invita por email a quien tenga que entrar y elige su rol. Para que alguien de *Equipo* vea sus clientes, usa el mismo email que en su ficha de Equipo interno.
   - **Servicios** y **objetivo de facturación**: ajústalos si hace falta.

---

## 8. Importar las propuestas antiguas

Se hace una vez desde un ordenador con [Node.js](https://nodejs.org) instalado (versión 20 o superior).

1. Descarga el código: en GitHub → **Code → Download ZIP**, y descomprímelo. Abre una terminal en esa carpeta y ejecuta `npm install`.
2. Crea un archivo llamado `.env.local` en esa carpeta con estas líneas (los valores son los mismos que pusiste en Vercel):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   ```
3. Pon todos los PDF y .md en una carpeta y ejecuta:
   ```bash
   npm run importar -- "/ruta/a/la/carpeta"
   ```
4. El script lee cada documento con IA y muestra un **resumen** (cliente, plan, importes, y si es lead nuevo, otra versión o un upsell). **No crea nada hasta que respondes `s`.**
5. Se crean como **Enviada** y marcadas **Por revisar**. En el CRM → Propuestas → **Por revisar**, confirma o corrige cada una, y marca las que se aceptaron o denegaron.

Los archivos ya importados se saltan solos, y lo que lee la IA se guarda (`.b9-extracciones.json`) para no pagar dos veces si lo repites.

---

## 9. Propuestas automáticas desde Google Drive

Cada PDF que guardes en la carpeta **"B9 · Propuestas CRM"** de tu Drive entra solo al CRM en menos de 10 minutos.

1. Abre https://script.google.com → **Nuevo proyecto**. Llámalo `B9 CRM`.
2. Borra lo que haya y pega el contenido de [`integraciones/drive-propuestas.gs`](integraciones/drive-propuestas.gs). Guarda.
3. **Configuración del proyecto** (rueda dentada) → **Propiedades del script** → añade:
   - `CRM_URL` → `https://crm.b9studios.com`
   - `INGESTA_SECRET` → el mismo valor que pusiste en Vercel
4. Vuelve al editor, elige la función **instalar** y pulsa **Ejecutar**. Google pedirá permiso para usar tu Drive: acéptalo.
5. Listo. Se crea la carpeta "B9 · Propuestas CRM". Lo procesado se mueve a "Procesadas"; lo que no sea una propuesta, a "No son propuestas". Si una propuesta pesa más de 4 MB, súbela a mano en el CRM.

---

## 10. Uso diario

- **Nueva propuesta**: Propuestas → Nueva propuesta → arrastra el PDF. Revisa lo que ha rellenado la IA y guarda.
- **¿Qué pasó con la propuesta?**: a los 7 días aparece el aviso con los botones *Aceptada / Denegada / Sigue en negociación*. A los 30 días te propone marcarla como *Sin respuesta*.
- **Aceptada** → eliges fecha de inicio y responsables → se crea la ficha del cliente (o se añade a la existente si ya era cliente).
- **Denegada** → motivo y comentario obligatorios; puedes poner una fecha para volver a contactar.
- **Renovaciones**: 30 días antes del fin del contrato aparece el aviso con *Renovar igual / Renovar con cambios / No renueva / Posponer*.
- **Exportar**: botón **CSV** en Propuestas y en Clientes (se abre directamente en Excel).

---

## 11. Problemas frecuentes

| Problema | Solución |
|---|---|
| "Tu cuenta todavía no tiene acceso" | Invítala en Ajustes → Acceso al CRM con el email exacto de su cuenta de Google. |
| Al entrar con Google vuelve al login | Revisa en Supabase → Authentication → URL Configuration que esté `https://crm.b9studios.com/auth/callback`. |
| La IA no rellena el formulario | Revisa que `ANTHROPIC_API_KEY` esté en Vercel y que la cuenta de Anthropic tenga saldo. Después, Redeploy. |
| No llegan emails | Revisa que el dominio esté "Verified" en Resend y que `RESEND_API_KEY` esté en Vercel. |
| Alguien de Equipo no ve sus clientes | Su email en Equipo interno debe coincidir con el de su cuenta, y debe estar asignado como responsable en la ficha del cliente. |
| Quiero ver que la comprobación diaria se ejecuta | Vercel → proyecto → **Settings → Cron Jobs** → *Run* para lanzarla a mano, y **Logs** para ver el resultado. |

---

## 12. Para desarrolladores

Next.js 15 (App Router) + Supabase (Postgres con RLS, Auth, Storage) + Tailwind 4, desplegado en Vercel. Extracción con la API de Claude (`@anthropic-ai/sdk`, salida estructurada con Zod).

```bash
npm install
npx supabase start                    # base de datos local (Docker)
cp .env.example .env.local            # rellena con las claves que muestra el comando anterior
node --env-file=.env.local scripts/datos-demo.mjs   # datos de ejemplo (usuario aitor@demo.local / demo1234)
npm run dev
```

- `supabase/migrations/` — esquema, reglas de negocio (no se puede denegar sin motivo, aceptar crea cliente, renovaciones) y seguridad por roles. Tras cambiar migraciones: `npm run sql-instalacion` regenera `supabase/instalar.sql`.
- `src/lib/extraccion.ts` — lectura de propuestas con IA. `src/lib/ingesta.ts` — alta desde archivo (formulario, importación y Drive).
- `src/lib/diario.ts` + `src/app/api/cron/diario` — comprobación diaria. En local: `curl -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/diario?hoy=2026-12-01"` (con `PERMITIR_FECHA_SIMULADA=1` si se usa `next start`).
- `src/app/api/ingesta` — entrada desde el script de Drive.
