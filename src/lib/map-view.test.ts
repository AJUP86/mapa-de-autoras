import { describe, expect, it } from "vitest";
import { viewFromSearch, withView } from "./map-view";

describe("viewFromSearch", () => {
  it("reads ?view=list", () => {
    expect(viewFromSearch("?view=list")).toBe("list");
    expect(viewFromSearch("view=list")).toBe("list");
    expect(viewFromSearch("?a=1&view=list")).toBe("list");
  });

  it("falls back to the map for anything else", () => {
    expect(viewFromSearch("")).toBe("map");
    expect(viewFromSearch("?view=map")).toBe("map");
    expect(viewFromSearch("?view=LIST")).toBe("map");
    expect(viewFromSearch("?view=")).toBe("map");
    expect(viewFromSearch("?other=list")).toBe("map");
  });
});

describe("withView", () => {
  it("adds view=list and keeps the path, other params and hash", () => {
    expect(withView("/es/map", "list")).toBe("/es/map?view=list");
    expect(withView("/es/map?a=1#top", "list")).toBe("/es/map?a=1&view=list#top");
  });

  it("does not duplicate an existing view param", () => {
    expect(withView("/es/map?view=list", "list")).toBe("/es/map?view=list");
    expect(withView("/es/map?view=map&a=1", "list")).toBe("/es/map?view=list&a=1");
  });

  it("removes view for the map, keeping the rest", () => {
    expect(withView("/es/map?view=list", "map")).toBe("/es/map");
    expect(withView("/es/map?a=1&view=list#top", "map")).toBe("/es/map?a=1#top");
    expect(withView("/en/map", "map")).toBe("/en/map");
  });

  it("keeps an absolute href absolute", () => {
    expect(withView("https://mapadeautoras.com/es/map?a=1", "list")).toBe(
      "https://mapadeautoras.com/es/map?a=1&view=list",
    );
    expect(withView("http://localhost:4321/es/map?view=list", "map")).toBe(
      "http://localhost:4321/es/map",
    );
  });
});
