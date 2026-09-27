import { describe, expect, it } from "vitest";
import { isEnsName, isFungibleId, isZerionUrl, normalizeWalletAddress } from "#/server/inputs.ts";

const BASE = "https://api.zerion.io";

describe("normalizeWalletAddress", () => {
  it("lowercases a checksummed address so one wallet is one cache entry", () => {
    expect(normalizeWalletAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    );
  });

  it("rejects anything that isn't 0x plus 40 hex characters", () => {
    expect(normalizeWalletAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960")).toBeNull();
    expect(normalizeWalletAddress("d8da6bf26964af9d7eed9e03e53415d37aa96045")).toBeNull();
    expect(normalizeWalletAddress("0xZZda6bf26964af9d7eed9e03e53415d37aa96045")).toBeNull();
    expect(normalizeWalletAddress("vitalik.eth")).toBeNull();
  });
});

describe("isFungibleId", () => {
  it("accepts the slug and UUID forms Zerion returns", () => {
    expect(isFungibleId("eth")).toBe(true);
    expect(isFungibleId("57389bff-fae9-46df-b9fc-7112009fe74e")).toBe(true);
  });

  it("rejects anything that could escape the fungibles path", () => {
    expect(isFungibleId("../wallets/0xdead")).toBe(false);
    expect(isFungibleId("eth/charts/year")).toBe(false);
    expect(isFungibleId("")).toBe(false);
    expect(isFungibleId("a".repeat(45))).toBe(false);
  });
});

describe("isEnsName", () => {
  it("accepts a .eth name in any case", () => {
    expect(isEnsName("vitalik.eth")).toBe(true);
    expect(isEnsName("Vitalik.ETH")).toBe(true);
    expect(isEnsName("sub.vitalik.eth")).toBe(true);
  });

  it("rejects a name that isn't .eth, and anything with a path or whitespace in it", () => {
    expect(isEnsName("vitalik.xyz")).toBe(false);
    expect(isEnsName(".eth")).toBe(false);
    expect(isEnsName("vitalik.eth/x")).toBe(false);
    expect(isEnsName("vitalik .eth")).toBe(false);
  });
});

describe("isZerionUrl", () => {
  it("accepts a links.next cursor on the Zerion origin", () => {
    expect(isZerionUrl(`${BASE}/v1/wallets/0xdead/transactions/?page%5Bafter%5D=abc`, BASE)).toBe(true);
  });

  it("rejects another origin, and anything that isn't a URL", () => {
    expect(isZerionUrl("https://evil.example/v1/wallets/0xdead/transactions/", BASE)).toBe(false);
    expect(isZerionUrl("/v1/wallets/0xdead/transactions/", BASE)).toBe(false);
    expect(isZerionUrl("", BASE)).toBe(false);
  });
});
