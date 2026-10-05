export type ParsedBooking = {
  type?: "flight" | "hotel" | "ticket" | "train" | "other";
  title?: string;
  reference?: string;
  startAt?: string;
  notes?: string;
  barcodeValue?: string;
};

/** Pulls reservation fields out of pasted confirmation text. No network, no model. */
export function parseBookingText(text: string): ParsedBooking {
  const source = text.replace(/\r/g, "");
  const flight = source.match(/\b([A-Z]{2})\s?(\d{2,4})\b/);
  const reference = source.match(/(?:confirmation|booking(?:\s+reference)?|record locator|pnr|reservation)[:\s#]*([A-Z0-9-]{4,12})/i);
  const terminal = source.match(/terminal\s+([A-Z0-9]+)/i);
  const clock = source.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const iso = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const checkIn = source.match(/check-?in[:\s]+(20\d{2}-\d{2}-\d{2})(?:[ T]([0-2]?\d:[0-5]\d))?/i);
  const hotel = /hotel|check-?in|nights?/i.test(source);
  const train = /\b(train|rail|shinkansen)\b/i.test(source);
  const notes = [terminal ? `Terminal ${terminal[1].toUpperCase()}` : "", source.includes("\n") ? "" : ""].filter(Boolean);
  let type: ParsedBooking["type"] = "other";
  if (flight) type = "flight";
  else if (hotel) type = "hotel";
  else if (train) type = "train";
  else if (/ticket|admission|entry/i.test(source)) type = "ticket";

  const date = checkIn?.[1] ?? (iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "");
  const time = checkIn?.[2] ?? (clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : "09:00");
  const code = flight ? `${flight[1]}${flight[2]}` : "";
  const ref = reference?.[1]?.toUpperCase() ?? "";
  return {
    type,
    title: code || undefined,
    reference: ref || code || undefined,
    startAt: date ? `${date}T${time.length === 5 ? time : "09:00"}` : undefined,
    notes: notes[0],
    barcodeValue: ref || undefined,
  };
}
