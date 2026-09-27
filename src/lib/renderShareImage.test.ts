// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { normalWallet } from "../engine/fixtures";
import { renderShareImage } from "./renderShareImage";

/**
 * happy-dom has no font loading API and no Canvas 2D context, so this proves the one thing that
 * does not need either: every font is requested, and `document.fonts.ready` is awaited, before the
 * canvas the image is drawn on is created.
 */

type FontStub = { load: ReturnType<typeof vi.fn>; ready: Promise<unknown> };

const trace: string[] = [];

function stubFonts(): FontStub {
  const stub: FontStub = {
    load: vi.fn((font: string) => {
      trace.push(`load:${font}`);
      return Promise.resolve([]);
    }),
    ready: Promise.resolve().then(() => trace.push("ready")),
  };
  Object.defineProperty(document, "fonts", { value: stub, configurable: true, writable: true });
  return stub;
}

afterEach(() => {
  trace.length = 0;
  vi.restoreAllMocks();
});

test("requests every font and awaits document.fonts.ready before it creates the canvas", async () => {
  const fonts = stubFonts();
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    trace.push(`element:${tag}`);
    return createElement(tag);
  });

  // No 2D context in happy-dom, so the draw step is the documented failure rather than a Blob.
  await expect(renderShareImage(normalWallet)).rejects.toThrow("Canvas 2D unavailable");

  expect(fonts.load).toHaveBeenCalledTimes(4);
  const readyAt = trace.indexOf("ready");
  const loadsBeforeReady = trace.slice(0, readyAt).filter((t) => t.startsWith("load:"));
  expect(loadsBeforeReady).toHaveLength(4);
  expect(readyAt).toBeLessThan(trace.indexOf("element:canvas"));
});
