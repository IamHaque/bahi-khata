import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePopupViewport } from "../usePopupViewport";

afterEach(() => vi.unstubAllGlobals());

it("tracks keyboard resize and viewport panning, then removes listeners", () => {
  const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0 });
  const remove = vi.spyOn(viewport, "removeEventListener");
  vi.stubGlobal("visualViewport", viewport);
  const { result, unmount } = renderHook(usePopupViewport);
  expect(result.current).toEqual({ "--popup-height": "700px", "--popup-top": "0px" });

  act(() => {
    viewport.height = 320;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(result.current).toEqual({ "--popup-height": "320px", "--popup-top": "0px" });
  act(() => {
    viewport.offsetTop = 85;
    viewport.dispatchEvent(new Event("scroll"));
  });
  expect(result.current).toEqual({ "--popup-height": "320px", "--popup-top": "85px" });
  unmount();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
});

it("leaves the dynamic CSS viewport fallback in place without VisualViewport", () => {
  vi.stubGlobal("visualViewport", undefined);
  const { result } = renderHook(usePopupViewport);
  expect(result.current).toEqual({});
});
