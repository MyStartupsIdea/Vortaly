import type { Metadata } from "next";
import { OwnerBookings } from "@/components/owner/OwnerBookings";

export const metadata: Metadata = {
  title: "Записи | Vortaly",
  robots: { index: false, follow: false },
};

/** A business owner's bookings for one business: `/owner/bookings?salon=<slug>`. */
export default function OwnerBookingsPage() {
  return <OwnerBookings />;
}
