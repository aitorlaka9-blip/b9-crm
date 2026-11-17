// Carga datos de ejemplo en la base de datos LOCAL. No usar en producción.
// Uso: node --env-file=.env.local scripts/datos-demo.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
  console.error("Este script solo se ejecuta contra la base de datos local.");
  process.exit(1);
}
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: u, error: eu } = await sb.auth.admin.createUser({
  email: "aitor@demo.local",
  password: "demo1234",
  email_confirm: true,
  user_metadata: { full_name: "Aitor" },
});
if (eu && !eu.message.includes("already")) throw eu;
const userId = u?.user?.id;

const { data: equipo } = await sb
  .from("equipo")
  .insert([{ nombre: "Aitor", usuario_id: userId }, { nombre: "Laura (guionista)" }, { nombre: "Marcos (filmmaker)" }])
  .select();

const { data: servicios } = await sb.from("servicios").select("id, nombre");
const sid = (n) => servicios.find((s) => s.nombre === n).id;
const hace = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

const demos = [
  { empresa: "Clínica Demo Sonrisa", contacto: "Elena Ruiz", sector: "Clínica dental", versiones: [
    { v: "A", plan: "Content Pro", m: 1800, u: 1200, d: 6, envio: 12, sv: ["Gestión de redes", "Reels", "Grabación en estudio"], estado: "enviada" },
    { v: "B", plan: "Content Pro + Ads", m: 2600, u: 1200, d: 6, envio: 12, sv: ["Gestión de redes", "Reels", "Grabación en estudio", "Anuncios Meta"], estado: "enviada" },
  ]},
  { empresa: "Inmobiliaria Demo Norte", contacto: "Javier Gil", sector: "Inmobiliaria", versiones: [
    { v: "A", plan: "Lead Boost", m: 2200, u: 0, d: 12, envio: 35, sv: ["Anuncios Meta", "Anuncios Google", "VSL"], estado: "enviada", abx: true },
  ]},
  { empresa: "Podcast Demo Emprende", contacto: "Sara Martín", sector: "Formación", versiones: [
    { v: "final", plan: "Podcast + gestión de redes", m: 3200, u: 2500, d: 12, envio: 3, sv: ["Podcast", "Grabación en estudio", "Gestión de redes", "YouTube"], estado: "en_negociacion" },
  ]},
  { empresa: "Restaurante Demo Brasa", contacto: "Pablo León", sector: "Hostelería", versiones: [
    { v: "A", plan: "Content Starter", m: 900, u: 300, d: 3, envio: null, sv: ["Reels", "Gestión de redes"], estado: "borrador" },
  ]},
];

for (const d of demos) {
  const { data: o } = await sb.from("oportunidades").insert({
    empresa: d.empresa, nombre_contacto: d.contacto, sector: d.sector,
    email: d.contacto.split(" ")[0].toLowerCase() + "@ejemplo.com", telefono: "600 000 000", created_by: userId,
  }).select().single();
  for (const p of d.versiones) {
    const { data: pr, error } = await sb.from("propuestas").insert({
      oportunidad_id: o.id, version: p.v, titulo_plan: p.plan, importe_mensual: p.m, importe_unico: p.u,
      duracion_meses: p.d, fecha_envio: p.envio == null ? null : hace(p.envio), preparada_por: equipo[0].id,
      vendida_por_tipo: p.abx ? "abx" : "interno", vendida_por_nombre: p.abx ? "Comercial ABX" : "Aitor",
      estado: p.estado, created_by: userId,
    }).select().single();
    if (error) throw error;
    await sb.from("propuesta_servicios").insert(p.sv.map((n) => ({ propuesta_id: pr.id, servicio_id: sid(n) })));
  }
}
console.log("Datos de ejemplo cargados. Entra con aitor@demo.local / demo1234");
