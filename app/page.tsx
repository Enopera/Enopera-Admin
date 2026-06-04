import { redirect } from "next/navigation";
import { tryGetAdmin } from "@/lib/admin/auth";

export default async function Home() {
  const admin = await tryGetAdmin();
  if (admin) {
    redirect("/utenti");
  }
  redirect("/admin/login");
}
