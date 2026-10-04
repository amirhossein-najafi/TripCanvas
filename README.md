# TripCanvas

**Plan less. Experience more.**

پلنر سفر تعاملی: برنامه روزبه‌روز، نقشه، بودجه، رزرو، و همکاری روی یک سفر. به‌جای داشبورد مالی، یک بوم سفر است؛ نقشه و کارت‌ها کنار هم حرکت می‌کنند.

## شروع سریع

```bash
npm install
npm run dev
```

اپ روی [http://localhost:3000](http://localhost:3000) بالا می‌آید. بدون هیچ کلیدی کار می‌کند: داده در همین مرورگر، داخل `localStorage`، ذخیره می‌شود.

از صفحه ورود، **Continue as Ali**، **Sara**، یا **Reza** را بزنید. رمز هر سه `demo` است.

| | |
| --- | --- |
| Ali | `ali@tripcanvas.app` · صاحب سفر نمونه |
| Sara | `sara@tripcanvas.app` · ویرایشگر |
| Reza | `reza@tripcanvas.app` · بیننده |

سفر نمونه توکیو، ۱۲ تا ۱۷ مارس ۲۰۲۷، عمومی است: [`/p/tokyo-2027`](http://localhost:3000/p/tokyo-2027).

## یک سفر چطور ساخته می‌شود

1. در هیرو بنویسید کجا می‌خواهید بروید. شهرها از آسیا، اروپا، آفریقا، آمریکای شمالی و جنوبی، و اقیانوسیه هستند: از توکیو و سئول تا مراکش، کیپ‌تاون، ریو، مکزیکوسیتی، سیدنی و ریکیاویک.
2. نقشه آرام روی مقصد زوم می‌کند. تاریخ و تعداد مسافر را بگذارید و **Create a trip** را بزنید.
3. **+ Add place** جاهای پیشنهادی را نشان می‌دهد. هاور روی لیست، مارکر را بزرگ می‌کند و برعکس.
4. جزئیات مکان روی دسکتاپ کشوی راست است و روی موبایل همان کامپوننت، bottom sheet.
5. کارت را بین روزها بکشید. مسیر همان روز دوباره کشیده می‌شود و اگر جابه‌جایی شکست بخورد، برمی‌گردد با پیام `Couldn't move activity.`

## داخل اپ

- **Itinerary.** نوار روزها، تایم‌لاین، درگ بین روزها، تقویم ماه، و برد با ستون Ideas.
- **Map.** مارکر شماره‌دار، رنگ مسیر جدا برای هر روز، و دوربینی که با اسکرول تایم‌لاین می‌آید. حالت روشن و تیره هر دو روی خود نقشه هم عوض می‌شوند.
- **Budget.** کل، خرج‌شده، باقی‌مانده. Hotel، Food، Transport، Activities، Shopping. مبلغ برنامه‌ریزی‌شده در برابر واقعی، و تسویه به شکل `Sara owes Ali $54`.
- **Bookings.** پرواز، هتل، بلیت، یادداشت، و **Show ticket** با QR تمام‌صفحه.
- **Collaborate.** دعوت با `/t/[slug]`، نقش‌های Owner / Editor / Viewer، آواتار حضور، و کامنت روی فعالیت. سفر عمومی از `/p/[slug]` با **Duplicate this trip**.
- **Polish.** `Ctrl` یا `Cmd` + `K` برای ساخت سفر، افزودن مکان، باز کردن سفر، رفتن به رزروها، و dark mode. اسکلتون به‌جای اسپینر. اگر نقشه نیاید: `We couldn't load the map.` و `Your itinerary is safe.`

## لایه Wow

- **Optimize route.** اگر مسیر روز قابل کوتاه شدن باشد: `Your route can be N minutes shorter.` ترتیب با نزدیک‌ترین همسایه، از اولین نقطه، عوض می‌شود و خط نقشه همزمان دوباره رسم می‌شود.
- **Travel Mode.** نمای موبایل روز سفر: سلام، کارت Next با فاصله دقیقه‌ای و Start navigation، و بعد از آن. اگر تاریخ سفر امروز نباشد، از خود سفر قابل پیش‌نمایش است.
- **Story Mode.** **Present trip** تمام‌صفحه، توقف به توقف، با زوم سینمایی نقشه.
- **Plan my day.** روی مکان‌های ذخیره‌شده، نه یک چت‌بات. مثلاً coffee، art، ramen، سقف پیاده‌روی، یا `Make this day less busy`.
- اگر روز جا داشته باشد و مکان ذخیره‌شده از نظر فاصله و مدت جا شود: `Mori Art Museum fits here.`
- باران و فعالیت بیرونی: هشدار `Outdoor activity` و عمل `Move indoor activities here`.

## حالت‌ها

**محلی، پیش‌فرض.** متغیرهای Supabase را خالی بگذارید. سه کاربر دمو، سفر توکیو، و هر چه بسازید در همین دستگاه می‌ماند. بیننده‌ها نمی‌توانند چیزی را عوض کنند.

**Supabase.** فایل `.env.example` را به `.env.local` کپی کنید:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

کلید service role فقط برای seed است و نباید به کلاینت برسد. اسکیما، RLS، باکت فایل رزروها، و Realtime در `supabase/migrations/0001_init.sql` است. آن را با `supabase db push` یا SQL Editor اعمال کنید. بعد از آن، Auth، Postgres، Storage، و حضور همزمان از همان رابط استفاده می‌کنند.

## اسکریپت‌ها

| دستور | کار |
| --- | --- |
| `npm run dev` | توسعه |
| `npm run build` سپس `npm start` | ساخت و اجرای پروداکشن |
| `npm test` | Vitest: مسیر، تسویه، جای خالی |
| `npm run test:e2e` | Playwright: ساخت سفر توکیو، افزودن Shibuya، درگ به روز بعد، دیدن مارکر |

## استک

Next.js (App Router) و TypeScript، Tailwind، Radix، Motion، dnd-kit، MapLibre GL با استایل OpenFreeMap، TanStack Query، Zustand، Supabase، Zod، React Hook Form، Vitest، Playwright.

نقشه کلید نمی‌خواهد. آب‌وهوا از Open-Meteo است و اگر تاریخ سفر بیرون پنجره پیش‌بینی باشد، آب‌وهوای فصلی همان مقصد نشان داده می‌شود. مکان‌ها کاتالوگ خود پروژه‌اند، نه یک Places API پولی.

## میانبرها

| کلید | کار |
| --- | --- |
| `Ctrl` / `Cmd` + `K` | پالت فرمان و جستجو |
| `Esc` | بستن جزئیات مکان |
| `←` `→` | روز قبل و بعد |

آدرس روز، مکان، و نما را نگه می‌دارد: `?day=&place=&view=`. نماها `timeline`، `calendar`، و `board` هستند.
