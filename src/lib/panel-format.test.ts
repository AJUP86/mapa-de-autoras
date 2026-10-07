import { describe, it, expect } from "vitest";
import { authorYears, coverLetter } from "./panel-format";

describe("coverLetter", () => {
  it.each([
    ["Rayuela", "R"],
    ["El llano en llamas", "L"],
    ["La casa de los espíritus", "C"],
    ["Los detectives salvajes", "D"],
    ["Las primas", "P"],
    ["L'amica geniale", "A"],
    ["L’amica geniale", "A"],
    ["The Vegetarian", "V"],
    ["A Room of One's Own", "R"],
    ["americanah", "A"],
    ["Lagos", "L"],
    ["Elena sabe", "E"],
    ["¿Quién mató a Palomino Molero?", "Q"],
    ["«Nada»", "N"],
    ["The", "T"],
    ["1984", "1"],
    ["  ébano  ", "É"],
  ])("%s → %s", (title, letter) => {
    expect(coverLetter(title)).toBe(letter);
  });
});

describe("authorYears", () => {
  const born = "n. {year}";
  it("shows both years with an en dash", () => {
    expect(authorYears(1960, 2021, born)).toBe("1960 – 2021");
  });
  it("uses the born template when only the birth year is known", () => {
    expect(authorYears(1960, undefined, born)).toBe("n. 1960");
    expect(authorYears(1960, undefined, "b. {year}")).toBe("b. 1960");
  });
  it("marks an unknown birth year when only the death year is known", () => {
    expect(authorYears(undefined, 1890, born)).toBe("? – 1890");
  });
  it("is empty when neither year is known", () => {
    expect(authorYears(undefined, undefined, born)).toBe("");
  });
});
