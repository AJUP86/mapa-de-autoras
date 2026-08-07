import { describe, it, expect } from "vitest";
import {
  addAuthor,
  updateAuthor,
  removeAuthor,
  addBook,
  updateBook,
  removeBook,
  type AuthorRow,
  type BookRow,
} from "./realtime-reducers";
import type { CountryEntry } from "./map-state";

function authorRow(over: Partial<AuthorRow> = {}): AuthorRow {
  return {
    id: "a1",
    name: "Ada",
    status: "read",
    birth_year: null,
    death_year: null,
    country_iso_a3: "AUS",
    published: true,
    ...over,
  };
}

function bookRow(over: Partial<BookRow> = {}): BookRow {
  return {
    id: "b1",
    author_id: "a1",
    title: "Book",
    year: 2000,
    display_order: 0,
    ...over,
  };
}

describe("addAuthor", () => {
  it("ignores unpublished authors and returns the same reference", () => {
    const cat: CountryEntry[] = [];
    expect(addAuthor(cat, authorRow({ published: false }))).toBe(cat);
  });

  it("creates a new country bucket with an empty books array", () => {
    const next = addAuthor([], authorRow());
    expect(next).toEqual([
      {
        iso_a3: "AUS",
        authors: [expect.objectContaining({ id: "a1", name: "Ada", status: "read", books: [] })],
      },
    ]);
  });

  it("appends to an existing country bucket", () => {
    const start = addAuthor([], authorRow({ id: "a1" }));
    const next = addAuthor(start, authorRow({ id: "a2", name: "Bea" }));
    expect(next[0].authors.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("is idempotent when the id is already present", () => {
    const start = addAuthor([], authorRow({ id: "a1" }));
    expect(addAuthor(start, authorRow({ id: "a1" }))).toBe(start);
  });

  it("maps null birth/death years to undefined", () => {
    const next = addAuthor([], authorRow({ birth_year: null, death_year: null }));
    const a = next[0].authors[0];
    expect(a.birth_year).toBeUndefined();
    expect(a.death_year).toBeUndefined();
  });
});

describe("updateAuthor", () => {
  it("removes the author (and its empty bucket) when it becomes unpublished", () => {
    const start = addAuthor([], authorRow({ id: "a1" }));
    expect(updateAuthor(start, authorRow({ id: "a1", published: false }))).toEqual([]);
  });

  it("moves the author to a new country and drops the empty old bucket", () => {
    const start = addAuthor([], authorRow({ id: "a1", country_iso_a3: "AUS" }));
    const next = updateAuthor(start, authorRow({ id: "a1", country_iso_a3: "ESP" }));
    expect(next.map((c) => c.iso_a3)).toEqual(["ESP"]);
    expect(next[0].authors.map((a) => a.id)).toEqual(["a1"]);
  });

  it("preserves the author's existing books across a top-level update", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ author_id: "a1", title: "T", year: 1999 }));
    const next = updateAuthor(cat, authorRow({ id: "a1", name: "Ada 2" }));
    const a = next[0].authors[0];
    expect(a.name).toBe("Ada 2");
    expect(a.books).toEqual([{ title: "T", year: 1999 }]);
  });
});

describe("removeAuthor", () => {
  it("removes by id and drops the now-empty bucket", () => {
    const start = addAuthor([], authorRow({ id: "a1" }));
    expect(removeAuthor(start, "a1")).toEqual([]);
  });

  it("keeps other authors in the same bucket", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addAuthor(cat, authorRow({ id: "a2", name: "Bea" }));
    expect(removeAuthor(cat, "a1")[0].authors.map((a) => a.id)).toEqual(["a2"]);
  });
});

describe("addBook", () => {
  it("appends to the matching author, sorted by year ascending", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ title: "Later", year: 2010 }));
    cat = addBook(cat, bookRow({ title: "Earlier", year: 1990 }));
    expect(cat[0].authors[0].books.map((b) => b.title)).toEqual(["Earlier", "Later"]);
  });

  it("is idempotent for the same title + year", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ title: "T", year: 2000 }));
    const before = cat[0].authors[0].books.length;
    cat = addBook(cat, bookRow({ title: "T", year: 2000 }));
    expect(cat[0].authors[0].books.length).toBe(before);
  });

  it("no-ops when the parent author is not in the catalog yet", () => {
    const cat = addAuthor([], authorRow({ id: "a1" }));
    const next = addBook(cat, bookRow({ author_id: "zzz", title: "X", year: 1 }));
    expect(next[0].authors[0].books).toEqual([]);
  });
});

describe("updateBook (7b-ii placeholder behavior)", () => {
  it("replaces the book that shares the same year", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ title: "Old", year: 2000 }));
    const next = updateBook(cat, bookRow({ author_id: "a1", title: "New", year: 2000 }));
    expect(next[0].authors[0].books).toEqual([{ title: "New", year: 2000 }]);
  });
});

describe("removeBook", () => {
  it("removes the matching book by title + year", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ title: "T", year: 2000 }));
    const next = removeBook(cat, bookRow({ author_id: "a1", title: "T", year: 2000 }));
    expect(next[0].authors[0].books).toEqual([]);
  });
});
