"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/features/trips/trip-provider";
import type { Booking, BookingType } from "@/types";
import { format } from "date-fns";
import { parseBookingText } from "@/lib/booking-parse";

const ICONS: Record<BookingType, string> = { flight: "✈️", hotel: "🏨", ticket: "🎟️", train: "🚆", other: "📎" };

type FormValues = { type: BookingType; title: string; reference: string; startAt: string; notes: string; barcodeValue: string; paste: string };

export function BookingsView() {
  const { bundle, canEdit, actions } = useTrip();
  const [ticket, setTicket] = useState<Booking | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const form = useForm<FormValues>({ defaultValues: { type: "flight", title: "", reference: "", startAt: "", notes: "", barcodeValue: "", paste: "" } });
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
            {booking.attachmentName && booking.attachmentUrl && (
              <a className="mt-2 block text-xs text-accent" href={booking.attachmentUrl} target="_blank" rel="noreferrer" download={booking.attachmentName}>View attachment · {booking.attachmentName}</a>
            )}
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
            await actions.createBooking({
              type: values.type,
              title: values.title,
              reference: values.reference,
              startAt: values.startAt,
              notes: values.notes,
              attachmentUrl: file?.url ?? null,
              attachmentName: file?.name ?? null,
              barcodeValue: values.barcodeValue || values.reference,
              barcodeType: "qr",
            });
            form.reset();
            setFile(null);
          })}
        >
          <select {...form.register("type")} className="h-10 w-full rounded-xl bg-card px-3">{(Object.keys(ICONS) as BookingType[]).map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <input {...form.register("title", { required: true })} placeholder="Title" className="h-10 w-full rounded-xl bg-card px-3" />
          <input {...form.register("reference", { required: true })} placeholder="Reservation number" className="h-10 w-full rounded-xl bg-card px-3" />
          <input type="datetime-local" {...form.register("startAt", { required: true })} className="h-10 w-full rounded-xl bg-card px-3" />
          <textarea {...form.register("notes")} placeholder="Notes" className="w-full rounded-xl bg-card p-3" />
          <textarea {...form.register("paste")} placeholder="Paste a confirmation email" className="w-full rounded-xl bg-card p-3" />
          <button type="button" className="text-sm text-accent" onClick={() => {
            const parsed = parseBookingText(form.getValues("paste"));
            if (parsed.type) form.setValue("type", parsed.type);
            if (parsed.title) form.setValue("title", parsed.title);
            if (parsed.reference) form.setValue("reference", parsed.reference);
            if (parsed.startAt) form.setValue("startAt", parsed.startAt);
            if (parsed.notes) form.setValue("notes", parsed.notes);
            if (parsed.barcodeValue) form.setValue("barcodeValue", parsed.barcodeValue);
          }}>Fill from text</button>
          <input {...form.register("barcodeValue")} placeholder="QR or barcode value" className="h-10 w-full rounded-xl bg-card px-3" />
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
              <QRCodeSVG value={ticket.barcodeValue || ticket.reference || ticket.title} size={240} />
            </div>
            {ticket.attachmentUrl && <a className="mt-4 inline-block text-sm text-accent" href={ticket.attachmentUrl} target="_blank" rel="noreferrer">Open the file</a>}
            <p className="mt-4 text-sm text-muted">Tap anywhere to close</p>
          </div>
        </button>
      )}
    </div>
  );
}
