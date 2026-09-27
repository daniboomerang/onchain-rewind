// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import type { EnsResult } from "../server/ens/ens.types";
import { createAppQueryClient } from "./query-client";
import { INVALID_INPUT, UNRESOLVED, useWalletInput } from "./wallet-input";

const resolveEnsName = vi.hoisted(() => vi.fn());
vi.mock("../server/ens/ens.functions", () => ({ resolveEnsName }));

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const wallets = [{ label: "vitalik.eth", address: ADDRESS }] as const;

/** Its own client per test, so one test's resolution is never another's cache hit. */
function withQueryClient() {
  const client = createAppQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderInput(value: string) {
  return renderHook(() => useWalletInput(value, []), { wrapper: withQueryClient() });
}

test("a name is resolving while the server is asked, then valid with the address it resolved to", async () => {
  let answer: (result: EnsResult) => void = () => {};
  resolveEnsName.mockReturnValueOnce(
    new Promise<EnsResult>((resolve) => {
      answer = resolve;
    }),
  );

  const { result } = renderInput("sassal.eth");

  await waitFor(() => expect(result.current.status).toBe("resolving"));
  expect(result.current.wallet).toBeNull();

  answer({ ok: true, data: { name: "sassal.eth", address: ADDRESS } });

  await waitFor(() => expect(result.current.status).toBe("valid"));
  expect(result.current.resolved).toBe("0xd8dA…6045");
  expect(result.current.wallet).toEqual({ address: ADDRESS, name: "sassal.eth" });
});

test("the name is sent to the server lowercased, exactly once", async () => {
  resolveEnsName.mockResolvedValue({ ok: true, data: { name: "sassal.eth", address: ADDRESS } });

  const { result } = renderInput("SASSAL.eth");

  await waitFor(() => expect(result.current.status).toBe("valid"));
  expect(resolveEnsName).toHaveBeenCalledWith({ data: { name: "sassal.eth" } });
  expect(resolveEnsName).toHaveBeenCalledTimes(1);
});

test.each([
  ["a name nobody registered", "not_found" as const],
  ["mainnet not answering", "upstream" as const],
])("%s shows the invalid state and suggests pasting an address", async (_case, error) => {
  resolveEnsName.mockResolvedValueOnce({ ok: false, error });

  const { result } = renderInput("nobody-has-this-name.eth");

  await waitFor(() => expect(result.current.status).toBe("invalid"));
  expect(result.current.error).toBe(UNRESOLVED[error]);
  expect(result.current.error).toContain("Paste an address");
  expect(result.current.wallet).toBeNull();
});

test("a thrown call is the invalid state too, never an unhandled rejection", async () => {
  resolveEnsName.mockRejectedValueOnce(new Error("offline"));

  const { result } = renderInput("sassal.eth");

  await waitFor(() => expect(result.current.status).toBe("invalid"));
  expect(result.current.error).toBe(UNRESOLVED.upstream);
});

test("input that is neither an address nor a name never reaches the server", async () => {
  resolveEnsName.mockClear();

  const { result } = renderInput("my wallet");

  expect(result.current).toEqual({ status: "invalid", error: INVALID_INPUT, wallet: null });
  expect(resolveEnsName).not.toHaveBeenCalled();
});

test("a demo wallet's own label never reaches the server, even though it is a name", () => {
  resolveEnsName.mockClear();

  const { result } = renderHook(() => useWalletInput("vitalik.eth", wallets), { wrapper: withQueryClient() });

  expect(result.current.status).toBe("valid");
  expect(result.current.wallet).toEqual({ address: ADDRESS, name: "vitalik.eth" });
  expect(resolveEnsName).not.toHaveBeenCalled();
});

test("an empty field is idle: nothing is invalid before anything is typed", () => {
  const { result } = renderInput("");

  expect(result.current).toEqual({ status: "idle", wallet: null });
});
