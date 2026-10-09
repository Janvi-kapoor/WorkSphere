import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CopyBookingReferenceButton } from "@/components/bookings/CopyBookingReferenceButton";

describe("CopyBookingReferenceButton", () => {
  it("renders tooltip with responsive alignment classes on hover for top/bottom placement", () => {
    render(
      <CopyBookingReferenceButton
        referenceId="WS-12345"
        tooltipPosition="top"
      />,
    );

    const button = screen.getByTestId("copy-booking-reference-btn");
    fireEvent.mouseEnter(button);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveClass("right-0");
    expect(tooltip).toHaveClass("sm:left-1/2");
    expect(tooltip).toHaveClass("translate-x-0");
    expect(tooltip).toHaveClass("sm:-translate-x-1/2");
  });
});
