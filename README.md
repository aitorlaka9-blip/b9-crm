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

## Importar propuestas antiguas en bloque

1. Pon todos los PDF y .md en una carpeta de tu ordenador.
2. En la carpeta del proyecto, ejecuta:

```bash
npm run importar -- "/ruta/a/la/carpeta"
```

3. El script lee cada documento con IA y te enseña un **resumen** (cliente, plan, importes, si es versión de otra propuesta o un cliente actual). No crea nada hasta que respondes `s`.
4. Las propuestas se crean como **Enviada** y marcadas **Por revisar**. En el CRM → Propuestas → "Por revisar" puedes corregir o confirmar cada una.

Los archivos que ya están en el CRM se saltan solos, y lo que lee la IA se guarda en la carpeta (`.b9-extracciones.json`) para no pagar dos veces si lo repites.

## Propuestas automáticas desde Google Drive

Cada PDF que guardes en la carpeta **"B9 · Propuestas CRM"** de tu Drive entra solo al CRM en menos de 10 minutos.

1. Abre https://script.google.com → **Nuevo proyecto**. Llámalo "B9 CRM".
2. Borra lo que haya y pega el contenido de `integraciones/drive-propuestas.gs`. Guarda.
3. Rueda dentada (**Configuración del proyecto**) → **Propiedades del script** → añade:
   - `CRM_URL` → la dirección del CRM (p. ej. `https://crm.b9studios.com`)
   - `INGESTA_SECRET` → el mismo valor que tiene la variable `INGESTA_SECRET` en Vercel
4. Vuelve al editor, elige la función **instalar** y pulsa **Ejecutar**. Google te pedirá permiso para usar tu Drive: acéptalo.
5. Listo. Se crea la carpeta "B9 · Propuestas CRM". Lo procesado se mueve a "Procesadas"; lo que no sea una propuesta, a "No son propuestas".
