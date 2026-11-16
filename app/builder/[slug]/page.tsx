import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuilderApp } from "@/components/builder/BuilderApp";
import { isValidSlug } from "@/lib/supabase/salons";

export const metadata: Metadata = {
  title: "Конструктор | Vortaly",
  robots: { index: false, follow: false },
};

/**
 * The site builder for one tenant. The page itself holds no data: the client
 * loads the draft from /api/builder/<slug>, which is where authorization is
 * enforced, so an unauthenticated visitor gets the unlock form and nothing else.
 */
export default async function BuilderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  return <BuilderApp slug={slug} />;
}
