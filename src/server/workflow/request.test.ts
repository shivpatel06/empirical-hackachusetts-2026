import { expect, it } from "vitest";
import { isSameOrigin } from "./request";
it("accepts same HTTP host independent of Next internal URL and rejects cross-site posts", () => {
  const check = (origin: string, host = "127.0.0.1:3100") =>
    isSameOrigin({ headers: new Headers({ origin, host }) });
  expect(check("http://127.0.0.1:3100")).toBe(true);
  expect(check("https://demo.example", "demo.example")).toBe(true);
  for (const origin of [
    "null",
    "",
    "https://evil.test",
    "http://127.0.0.1:3101",
    "http://127.0.0.1:3100/path",
    "http://a@127.0.0.1:3100",
  ])
    expect(check(origin)).toBe(false);
  expect(isSameOrigin({ headers: new Headers() })).toBe(false);
});
