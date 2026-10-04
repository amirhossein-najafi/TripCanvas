"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/features/trips/trip-provider";
import type { Booking, BookingType } from "@/types";
import { format } from "date-fns";

const ICONS: Record<BookingType, string> = { flight: "✈️", hotel: "🏨", ticket: "🎟️", train: "🚆", other: "📎" };

type FormValues = { type: BookingType; title: string; reference: string; startAt: string; notes: string };

export function BookingsView() {
  const { bundle, canEdit, actions } = useTrip();
  const [ticket, setTicket] = useState<Booking | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const form = useForm<FormValues>({ defaultValues: { type: "flight", title: "", reference: "", startAt: "", notes: "" } });
  if (!bundle) return null;
  return (
    <div className="h-full overflow-auto px-5 py-6">
      <h1 className="font-serif text-4xl font-semibold">Your bookings</h1>
      <div className="mt-6 space-y-3">
        {bundle.bookings.map((booking) => (
          <article key={booking.id} className="rounded-[18px] border border-border bg-card p-4">
            <p className="text-lg">{ICONS[booking.type]} {booking.title}</p>
            <p className="mt-1 font-mono text-sm tabular">{booking.reference}</p>
            <p className="mt-1 text-sm text-muted">{format(new Date(booking.startAt), "MMM d · HH:mm")}</p>
            {booking.notes && <p className="mt-2 text-sm">{booking.notes}</p>}
            {booking.attachmentName && <p className="mt-2 text-xs text-muted">{booking.attachmentName}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTicket(booking)}>Show ticket</Button>
              {canEdit && <button type="button" className="text-xs text-muted" onClick={() => actions.deleteBooking(booking.id)}>Remove</button>}
            </div>
          </article>
        ))}
        {!bundle.bookings.length && <p className="text-muted">Tickets, hotels, and confirmations live here.</p>}
      </div>
      {canEdit && (
        <form
          className="mt-8 space-y-3"
          onSubmit={form.handleSubmit(async (values) => {
            await actions.createBooking({ ...values, attachmentUrl: file?.url ?? null, attachmentName: file?.name ?? null });
            form.reset();
            setFile(null);
          })}
        >
          <select {...form.register("type")} className="h-10 w-full rounded-xl bg-card px-3">{(Object.keys(ICONS) as BookingType[]).map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <input {...form.register("title", { required: true })} placeholder="Title" className="h-10 w-full rounded-xl bg-card px-3" />
          <input {...form.register("reference", { required: true })} placeholder="Reservation number" className="h-10 w-full rounded-xl bg-card px-3" />
          <input type="datetime-local" {...form.register("startAt", { required: true })} className="h-10 w-full rounded-xl bg-card px-3" />
          <textarea {...form.register("notes")} placeholder="Notes" className="w-full rounded-xl bg-card p-3" />
          <input type="file" accept="image/*,application/pdf" onChange={(event) => {
            const next = event.target.files?.[0];
            if (!next) return;
            if (next.size > 400_000) {
              setFile({ url: "", name: `${next.name} (too large to store offline)` });
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setFile({ url: String(reader.result), name: next.name });
            reader.readAsDataURL(next);
          }} />
          <Button type="submit">Save booking</Button>
        </form>
      )}
      {ticket && (
        <button type="button" className="fixed inset-0 z-50 grid place-items-center bg-background p-6" onClick={() => setTicket(null)}>
          <div className="text-center">
            <p className="font-serif text-3xl font-semibold">{ticket.title}</p>
            <p className="mt-2 font-mono">{ticket.reference}</p>
            <div className="mt-6 rounded-3xl bg-white p-4">
              <QRCodeSVG value={`${ticket.title} ${ticket.reference}`} size={240} />
            </div>
            <p className="mt-4 text-sm text-muted">Tap anywhere to close</p>
          </div>
        </button>
      )}
    </div>
  );
}
