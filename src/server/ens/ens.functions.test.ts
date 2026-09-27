import { describe, expect, it } from "vitest";
import { readEnsAddress } from "#/server/ens/ens.functions.ts";

/**
 * Resolution itself talks to mainnet, so it isn't unit-tested here: `vitalik.eth` →
 * `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` and an unregistered name → `not_found` were
 * verified live on 2026-09-27. What is tested is everything that must not reach the network.
 */
describe("readEnsAddress", () => {
  it("refuses a name that isn't a .eth name", async () => {
    expect(await readEnsAddress({ name: "vitalik.xyz" })).toEqual({ ok: false, error: "invalid_name" });
    expect(await readEnsAddress({ name: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" })).toEqual({
      ok: false,
      error: "invalid_name",
    });
    expect(await readEnsAddress({ name: "" })).toEqual({ ok: false, error: "invalid_name" });
  });

  it("refuses a name carrying a path or whitespace", async () => {
    expect(await readEnsAddress({ name: "vitalik.eth/../x" })).toEqual({ ok: false, error: "invalid_name" });
    expect(await readEnsAddress({ name: "vitalik .eth" })).toEqual({ ok: false, error: "invalid_name" });
  });

  it("refuses a .eth name that ENS normalisation rejects", async () => {
    // `!` and `_` are disallowed codepoints: normalisation throws, so nothing is looked up.
    expect(await readEnsAddress({ name: "vitalik!.eth" })).toEqual({ ok: false, error: "invalid_name" });
    expect(await readEnsAddress({ name: "vitalik_x.eth" })).toEqual({ ok: false, error: "invalid_name" });
    expect(await readEnsAddress({ name: "vitalik..eth" })).toEqual({ ok: false, error: "invalid_name" });
  });
});
