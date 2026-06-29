/**
 * Verifies POC avatar tooltips escape overflow-hidden ancestors via Portal.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

beforeAll(() => {
  if (!Element.prototype.getBoundingClientRect) {
    Element.prototype.getBoundingClientRect = () =>
      ({
        width: 28,
        height: 28,
        top: 100,
        left: 100,
        right: 128,
        bottom: 128,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
  }
});

describe("TooltipContent portal behavior", () => {
  it("renders visible tooltip outside overflow-hidden wrapper", async () => {
    const { container: _container } = render(
      <TooltipProvider delayDuration={0}>
        <div data-testid="overflow-wrap" style={{ overflow: "hidden", width: 200, height: 80 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">MB</button>
            </TooltipTrigger>
            <TooltipContent>MB: Mansi Bhargava</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>,
    );

    const overflowWrap = screen.getByTestId("overflow-wrap");
    fireEvent.pointerMove(screen.getByRole("button", { name: "MB" }));

    await waitFor(() => {
      expect(screen.getAllByText("MB: Mansi Bhargava").length).toBeGreaterThan(0);
    });

    const popperContent = document.body.querySelector("[data-radix-popper-content-wrapper]");
    expect(popperContent).toBeTruthy();
    expect(overflowWrap.contains(popperContent!)).toBe(false);
  });
});
