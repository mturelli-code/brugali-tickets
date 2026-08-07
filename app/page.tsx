import { redirect } from "next/navigation";

// La app principal es la gestión operativa. El resumen para dirección vive en /direccion.
export default function Home() {
  redirect("/operativo");
}
