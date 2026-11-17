import { exigirRol } from "@/lib/sesion";
import { Cabecera, Vacio } from "@/components/ui";

export default async function ClientesPage() {
  await exigirRol();
  return (
    <div>
      <Cabecera titulo="Clientes" />
      <Vacio>
        Las fichas de cliente se crean automáticamente al aceptar una propuesta. Llegan en la <b>fase 2</b>.
      </Vacio>
    </div>
  );
}
