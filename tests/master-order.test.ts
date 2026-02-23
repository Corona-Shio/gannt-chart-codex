import { describe, expect, it } from "vitest";

import { buildSortOrderPatches, getNextSortOrder, moveItem, moveItemByDrop, renumberSortOrders } from "../lib/master-order";

describe("moveItem", () => {
  it("moves an item to a new index", () => {
    const source = ["a", "b", "c", "d"];
    expect(moveItem(source, 1, 3)).toEqual(["a", "c", "d", "b"]);
  });

  it("returns shallow copy when indices are the same", () => {
    const source = ["a", "b", "c"];
    const result = moveItem(source, 1, 1);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });
});

describe("moveItemByDrop", () => {
  const rows = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" }
  ];

  it("inserts before target", () => {
    const result = moveItemByDrop(rows, "c", "a", "before");
    expect(result.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("inserts after target", () => {
    const result = moveItemByDrop(rows, "a", "c", "after");
    expect(result.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sort order helpers", () => {
  it("renumbers with step=10", () => {
    expect(renumberSortOrders(["x", "y", "z"]))
      .toEqual([
        { id: "x", sortOrder: 10 },
        { id: "y", sortOrder: 20 },
        { id: "z", sortOrder: 30 }
      ]);
  });

  it("returns changed rows only", () => {
    const current = [
      { id: "a", sortOrder: 10 },
      { id: "b", sortOrder: 20 },
      { id: "c", sortOrder: 30 }
    ];

    const noChange = buildSortOrderPatches(current, ["a", "b", "c"]);
    expect(noChange).toEqual([]);

    const changed = buildSortOrderPatches(current, ["c", "a", "b"]);
    expect(changed).toEqual([
      { id: "c", sortOrder: 10 },
      { id: "a", sortOrder: 20 },
      { id: "b", sortOrder: 30 }
    ]);
  });

  it("computes next sort order at tail", () => {
    expect(getNextSortOrder([])).toBe(10);
    expect(getNextSortOrder([10, 30, 20])).toBe(40);
  });
});
