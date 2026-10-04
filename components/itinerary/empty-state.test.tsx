import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/itinerary/empty-state";

describe("empty itinerary", () => {
  it("invites the first place", () => {
    render(<EmptyState destination="Tokyo" onExplore={() => undefined} />);
    expect(screen.getByText(/Your trip starts here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explore places/ })).toBeInTheDocument();
  });
});
