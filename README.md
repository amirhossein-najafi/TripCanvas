# TripCanvas

**Plan less. Experience more.**

An interactive trip planner: a day-by-day plan, a map, a budget, bookings, and collaboration on one trip. The map and the cards move together.

## What to publish

Ship the source, not a build. `.gitignore` already skips `.next`, `node_modules`, and `test-results`. A portfolio archive or GitHub repo should include `app`, `components`, `features`, `lib`, `public`, `supabase`, `store`, `types`, `package.json`, `package-lock.json`, the config files, and this README. Leave out `.next`, `node_modules`, and `.git`.

## Quick start

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). It needs no API keys. Data stays in this browser, in `localStorage`.

On the sign-in screen, choose **Continue as Ali**, **Sara**, or **Reza**. The password for all three is `demo`.

| | |
| --- | --- |
| Ali | `ali@tripcanvas.app` · owner of the sample trip |
| Sara | `sara@tripcanvas.app` · editor |
| Reza | `reza@tripcanvas.app` · viewer |

The sample Tokyo trip, March 12–17 2027, is public: [`/p/tokyo-2027`](http://localhost:3000/p/tokyo-2027).

## Make a trip

1. In the hero, type where you want to go. Cities span Asia, Europe, Africa, the Americas, and Oceania: Tokyo and Seoul, Marrakech, Cape Town, Rio, Mexico City, Sydney, Reykjavík, and others.
2. The map eases in on the destination. Set the dates and the number of travelers, then choose **Create a trip**.
3. **+ Add place** lists suggested places. Hovering a row enlarges its marker, and hovering a marker highlights the row.
4. Place details open as a drawer on the right on desktop, and as a bottom sheet on mobile.
5. Drag a card from one day to another. That day's route redraws. If the move fails, it rolls back with `Couldn't move activity.`

Only the trip owner can delete it: open **•••**, then **Settings**, then **Delete trip**.

## Inside the app

- **Itinerary.** Day chips, a timeline, drag across days, a month calendar, and a board with an Ideas column.
- **Map.** Numbered markers, a route color per day, and a camera that follows the timeline as you scroll. Light and dark mode change the map too.
- **Budget.** Total, spent, and remaining. Hotel, Food, Transport, Activities, Shopping. Planned against actual, and balances such as `Sara owes Ali $54`.
- **Bookings.** Flights, hotels, tickets, notes, and **Show ticket** with a full-screen QR code.
- **Collaborate.** Invite people with a token link `/t/[token]` and a role of Editor or Viewer. A public itinerary lives at `/p/[slug]` and does not include bookings, expenses, comments, or emails. **Duplicate this trip** copies the public plan.
- **Polish.** `Ctrl` or `Cmd` + `K` creates a trip, adds a place, opens a trip, jumps to bookings, and toggles dark mode. Loading states are skeletons. If the map fails: `We couldn't load the map.` and `Your itinerary is safe.`

## The extra layer

- **Optimize route.** When a day can be shorter: `Your route can be N minutes shorter.` Nearest-neighbour reorders the stops from the first point, and the map line redraws with the cards.
- **Travel Mode.** A mobile view of the travel day: a greeting, a Next card with minutes away and Start navigation, then what comes after. If the trip is not today, you can still preview it.
- **Story Mode.** **Present trip** goes full screen, stop by stop, with a cinematic zoom on the map.
- **Plan my day.** It plans from saved places, not a chatbot. Try coffee, art, ramen, a walking cap, or `Make this day less busy`.
- If a day has a gap and a saved place fits the distance and the duration: `Mori Art Museum fits here.`
- Rain plus an outdoor stop shows `Outdoor activity` and **Move indoor activities here**.

Tokyo is the only trip that arrives already filled in. Every other city can be created from the homepage, then filled from its own place list.

## Modes

**Local, the default.** Leave the Supabase variables empty. The three demo people, the Tokyo trip, and anything you create stay on this device. Viewers cannot change anything.

**Supabase.** Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service role key is for seeding only and must not reach the client. Schema, RLS, invites, the booking-files bucket, and Realtime are in `supabase/migrations`. Apply every file, in order, with `supabase db push` or the SQL Editor. Auth, Postgres, Storage, and live presence then use the same interface.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` then `npm start` | Production build and server |
| `npm test` | Vitest for routing, balances, invites, and planning |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run test:e2e` | Playwright: create a Tokyo trip, add Shibuya, drag it to the next day, see the marker |

## Stack

Next.js App Router and TypeScript, Tailwind, Radix, Motion, dnd-kit, MapLibre GL with OpenFreeMap styles, TanStack Query, Zustand, Supabase, Zod, React Hook Form, Vitest, and Playwright.

The map needs no key. Weather comes from Open-Meteo. If the trip dates fall outside the forecast window, the app shows seasonal weather for that destination. Places come from the catalog in this repo, not a paid Places API.

## Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl` / `Cmd` + `K` | Command palette and search |
| `Esc` | Close place details |
| `←` `→` | Previous and next day |

The URL keeps the day, place, and view: `?day=&place=&view=`. Views are `timeline`, `calendar`, and `board`.
