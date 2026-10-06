import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function TestConsumer() {
  const { toast } = useToast();
  return (
    <button
      onClick={() => toast("Sync failed", "error")}
      data-testid="trigger-toast"
    >
      Trigger Toast
    </button>
  );
}

describe("Toast Duplicate Message Debounce (#1748)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("suppresses duplicate toast messages triggered within 3 seconds", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    const button = screen.getByTestId("trigger-toast");

    // Click 3 times rapidly
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // Only 1 toast item should be rendered
    const toasts = screen.getAllByRole("alert");
    expect(toasts).toHaveLength(1);
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
  });

  it("allows identical toast message after 3 seconds have passed", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    const button = screen.getByTestId("trigger-toast");

    fireEvent.click(button);
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    // Advance time by 3001ms
    act(() => {
      jest.advanceTimersByTime(3001);
    });

    fireEvent.click(button);
    // Identical error message updates/replaces rather than stacking duplicate toasts
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Sync failed")).toBeInTheDocument();
  });

  it("replaces existing identical toast without stacking multiple duplicates (#4558)", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    const button = screen.getByTestId("trigger-toast");

    fireEvent.click(button);
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    // After timer advances, second trigger should still only have 1 toast rendered
    act(() => {
      jest.advanceTimersByTime(3500);
    });

    fireEvent.click(button);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
