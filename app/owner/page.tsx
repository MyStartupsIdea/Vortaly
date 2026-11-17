import type { Metadata } from "next";
import { OwnerHome } from "@/components/owner/OwnerHome";

export const metadata: Metadata = {
  title: "Вход для владельцев | Vortaly",
  robots: { index: false, follow: false },
};

/** Business owners sign in with Telegram here and open their builder. */
export default function OwnerPage() {
  return <OwnerHome />;
}
