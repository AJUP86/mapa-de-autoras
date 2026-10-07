import { describe, it, expect } from "vitest";
import { isValidEmail, joinWaitlist } from "./waitlist";

describe("isValidEmail", () => {
  it("accepts a simple x@y.z address", () => {
    expect(isValidEmail("prueba@example.com")).toBe(true);
    expect(isValidEmail("nombre.apellido+mapa@correo.co.uk")).toBe(true);
  });
  it("trims surrounding spaces", () => {
    expect(isValidEmail("  prueba@example.com \n")).toBe(true);
  });
  it("rejects empty values and missing parts", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("prueba.example.com")).toBe(false);
    expect(isValidEmail("prueba@example")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("prueba@example.")).toBe(false);
  });
  it("rejects spaces inside the address", () => {
    expect(isValidEmail("prue ba@example.com")).toBe(false);
  });
  it("rejects addresses longer than 254 characters", () => {
    const domain = "@example.com";
    expect(isValidEmail("a".repeat(254 - domain.length) + domain)).toBe(true);
    expect(isValidEmail("a".repeat(255 - domain.length) + domain)).toBe(false);
  });
});

describe("joinWaitlist (stub until Stage 12)", () => {
  it("resolves not_available", async () => {
    await expect(
      joinWaitlist({ email: "prueba@example.com", locale: "es", news: false }),
    ).resolves.toEqual({ ok: false, reason: "not_available" });
  });
});
