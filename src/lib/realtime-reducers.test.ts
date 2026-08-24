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
    status: "to_read",
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
        authors: [expect.objectContaining({ id: "a1", name: "Ada", books: [] })],
      },
    ]);
  });

  it("does not carry a status field on the author", () => {
    const next = addAuthor([], authorRow());
    expect(next[0].authors[0]).not.toHaveProperty("status");
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
    cat = addBook(cat, bookRow({ author_id: "a1", id: "bx", title: "T", year: 1999 }));
    const next = updateAuthor(cat, authorRow({ id: "a1", name: "Ada 2" }));
    const a = next[0].authors[0];
    expect(a.name).toBe("Ada 2");
    expect(a.books).toEqual([{ id: "bx", title: "T", year: 1999, status: "to_read" }]);
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
  it("appends to the matching author with its status, sorted by display_order", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b2", title: "Later", year: 2010, display_order: 1 }));
    cat = addBook(cat, bookRow({ id: "b1", title: "Earlier", year: 1990, display_order: 0 }));
    expect(cat[0].authors[0].books.map((b) => b.title)).toEqual(["Earlier", "Later"]);
  });

  it("carries the book status onto the catalog", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "T", status: "reading" }));
    expect(cat[0].authors[0].books[0]).toEqual({
      id: "b1",
      title: "T",
      year: 2000,
      status: "reading",
    });
  });

  it("is idempotent for the same id", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "T", year: 2000 }));
    const before = cat[0].authors[0].books.length;
    cat = addBook(cat, bookRow({ id: "b1", title: "T", year: 2000 }));
    expect(cat[0].authors[0].books.length).toBe(before);
  });

  it("no-ops when the parent author is not in the catalog yet", () => {
    const cat = addAuthor([], authorRow({ id: "a1" }));
    const next = addBook(cat, bookRow({ id: "zzz", author_id: "zzz", title: "X", year: 1 }));
    expect(next[0].authors[0].books).toEqual([]);
  });
});

describe("updateBook", () => {
  it("updateBook changes a book's status in place by id", () => {
    const cat = addBook([{ iso_a3: "ESP", authors: [{ id: "a", name: "a", books: [] }] }], {
      id: "b1",
      author_id: "a",
      title: "T",
      year: 2000,
      display_order: 0,
      status: "to_read",
    });
    const next = updateBook(cat, {
      id: "b1",
      author_id: "a",
      title: "T",
      year: 2000,
      display_order: 0,
      status: "read",
    });
    expect(next[0].authors[0].books[0].status).toBe("read");
  });

  it("updates title/year in place by id without adding a row", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "Old", year: 2000 }));
    const next = updateBook(
      cat,
      bookRow({ id: "b1", title: "New", year: 2001, status: "reading" }),
    );
    expect(next[0].authors[0].books).toEqual([
      { id: "b1", title: "New", year: 2001, status: "reading" },
    ]);
  });

  it("keeps display_order sorting after an update", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "First", display_order: 0 }));
    cat = addBook(cat, bookRow({ id: "b2", title: "Second", display_order: 1 }));
    const next = updateBook(cat, bookRow({ id: "b1", title: "First!", display_order: 5 }));
    expect(next[0].authors[0].books.map((b) => b.title)).toEqual(["Second", "First!"]);
  });
});

describe("removeBook", () => {
  it("removes the matching book by id", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "T", year: 2000 }));
    const next = removeBook(cat, bookRow({ id: "b1", author_id: "a1" }));
    expect(next[0].authors[0].books).toEqual([]);
  });

  it("leaves other books of the same author untouched", () => {
    let cat = addAuthor([], authorRow({ id: "a1" }));
    cat = addBook(cat, bookRow({ id: "b1", title: "Keep", display_order: 0 }));
    cat = addBook(cat, bookRow({ id: "b2", title: "Drop", display_order: 1 }));
    const next = removeBook(cat, bookRow({ id: "b2", author_id: "a1" }));
    expect(next[0].authors[0].books.map((b) => b.id)).toEqual(["b1"]);
  });
});
