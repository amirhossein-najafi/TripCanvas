export function EmptyState({ destination, onExplore }: { destination: string; onExplore: () => void }) {
  return (
    <div data-testid="empty-itinerary" className="mx-auto flex max-w-sm flex-col items-start gap-3 px-6 py-16">
      <p className="font-serif text-4xl leading-none font-semibold">Your trip starts here ✈️</p>
      <p className="text-muted">Add your first place or explore things to do in {destination}.</p>
      <button type="button" onClick={onExplore} className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white">
        Explore places
      </button>
    </div>
  );
}
