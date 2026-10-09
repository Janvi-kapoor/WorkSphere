import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { VerifiedExplorerBadge } from "@/components/badges/VerifiedExplorerBadge";

describe("VerifiedExplorerBadge", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        badges: [
          {
            id: "verified_explorer",
            earned: true,
            progress: 10,
            target: 10,
          },
        ],
      }),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders badge and shows tooltip with responsive alignment classes on hover", async () => {
    render(<VerifiedExplorerBadge />);

    await waitFor(() => {
      expect(screen.getByText("Verified Explorer")).toBeInTheDocument();
    });

    const badge = screen.getByText("Verified Explorer").parentElement!;
    fireEvent.mouseEnter(badge);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveClass("right-0");
    expect(tooltip).toHaveClass("sm:left-1/2");
    expect(tooltip).toHaveClass("translate-x-0");
    expect(tooltip).toHaveClass("sm:-translate-x-1/2");
  });
});
