import { VortalyAdminShell } from "@/components/admin/VortalyAdminShell";
import type { ReactNode } from "react";

export const metadata = {
  title: "Панель администратора | Vortaly",
  description: "Управление записями, услугами и ценами салона Chinor",
};

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The admin panel is a desktop/tablet owner tool — it breaks out of the
  // mobile 460px frame used by the Telegram Mini App. The root layout still
  // wraps everything in the provider tree (Telegram, I18n, Booking), so this
  // shell gets i18n and Telegram context but renders full-width.
  return <VortalyAdminShell>{children}</VortalyAdminShell>;
}
