import type { Metadata } from "next";
import { StartBusiness } from "@/components/owner/StartBusiness";

export const metadata: Metadata = {
  title: "Создать приложение для бизнеса | Vortaly",
  description: "Опишите бизнес словами — ИИ соберёт сайт и Telegram Mini App с онлайн-записью на русском и узбекском.",
};

/** Self-serve start: the owner describes the business, signs in, gets a site. */
export default function StartPage() {
  return <StartBusiness />;
}
