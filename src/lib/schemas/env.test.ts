import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("applies defaults when variables are absent", () => {
    const env = parseServerEnv({});
    expect(env).toEqual({
      AI_MODE: "fixture",
      OPENAI_API_KEY: undefined,
      DATABASE_PATH: "./data/app.db",
      DEMO_MODE: true,
      CLINIC_TIMEZONE: "America/New_York",
    });
  });

  it("treats empty strings from .env files as unset", () => {
    const env = parseServerEnv({ OPENAI_API_KEY: "", DATABASE_PATH: "", DEMO_MODE: "", CLINIC_TIMEZONE: "" });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DATABASE_PATH).toBe("./data/app.db");
    expect(env.DEMO_MODE).toBe(true);
    expect(env.CLINIC_TIMEZONE).toBe("America/New_York");
  });

  it("accepts explicit valid values", () => {
    const env = parseServerEnv({
      OPENAI_API_KEY: "test-key-value",
      DATABASE_PATH: "/tmp/x.db",
      DEMO_MODE: "false",
      CLINIC_TIMEZONE: "America/Chicago",
    });
    expect(env.OPENAI_API_KEY).toBe("test-key-value");
    expect(env.DEMO_MODE).toBe(false);
    expect(env.CLINIC_TIMEZONE).toBe("America/Chicago");
  });

  it("rejects a non-boolean DEMO_MODE", () => {
    expect(() => parseServerEnv({ DEMO_MODE: "yes" })).toThrow(/DEMO_MODE/);
  });

  it("rejects an unknown timezone", () => {
    expect(() => parseServerEnv({ CLINIC_TIMEZONE: "Mars/Olympus_Mons" })).toThrow(/CLINIC_TIMEZONE/);
  });

  it("does not echo supplied values in validation errors", () => {
    const secret = "secret-value-should-not-appear";
    let message = "";
    try {
      parseServerEnv({ OPENAI_API_KEY: secret, DEMO_MODE: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DEMO_MODE/);
    expect(message).not.toContain(secret);
  });
});
