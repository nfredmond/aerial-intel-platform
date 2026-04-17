import { describe, expect, it } from "vitest";

import { buildVersionDiff } from "./version-diff";

describe("buildVersionDiff", () => {
  it("returns a single unchanged entry when both sides are deep-equal objects", () => {
    const a = { x: 1, y: { z: [1, 2, 3] } };
    const b = { x: 1, y: { z: [1, 2, 3] } };
    const diff = buildVersionDiff(a, b);
    expect(diff.every((d) => d.change === "unchanged")).toBe(true);
    expect(diff.find((d) => d.path === "x")).toEqual({
      path: "x",
      left: 1,
      right: 1,
      change: "unchanged",
    });
  });

  it("flags an added key at the top level", () => {
    const diff = buildVersionDiff({ a: 1 }, { a: 1, b: 2 });
    const added = diff.find((d) => d.path === "b");
    expect(added).toEqual({ path: "b", left: undefined, right: 2, change: "added" });
  });

  it("flags a removed key at the top level", () => {
    const diff = buildVersionDiff({ a: 1, b: 2 }, { a: 1 });
    const removed = diff.find((d) => d.path === "b");
    expect(removed).toEqual({ path: "b", left: 2, right: undefined, change: "removed" });
  });

  it("flags a changed primitive value", () => {
    const diff = buildVersionDiff({ a: 1 }, { a: 2 });
    expect(diff).toEqual([{ path: "a", left: 1, right: 2, change: "changed" }]);
  });

  it("descends into nested objects and reports full dot-paths", () => {
    const diff = buildVersionDiff(
      { mission: { status: "planned", name: "A" } },
      { mission: { status: "active", name: "A" } },
    );
    const changed = diff.find((d) => d.change === "changed");
    expect(changed?.path).toBe("mission.status");
    expect(changed?.left).toBe("planned");
    expect(changed?.right).toBe("active");
  });

  it("compares arrays pairwise and flags length asymmetry", () => {
    const diff = buildVersionDiff({ arr: [1, 2] }, { arr: [1, 2, 3] });
    const added = diff.find((d) => d.change === "added");
    expect(added?.path).toBe("arr[2]");
    expect(added?.right).toBe(3);
  });

  it("flags removed array slots on the right", () => {
    const diff = buildVersionDiff({ arr: [1, 2, 3] }, { arr: [1, 2] });
    const removed = diff.find((d) => d.change === "removed");
    expect(removed?.path).toBe("arr[2]");
    expect(removed?.left).toBe(3);
  });

  it("treats null asymmetric with missing as a change, not a removal", () => {
    const diff = buildVersionDiff({ a: null }, { a: 1 });
    const changed = diff.find((d) => d.path === "a");
    expect(changed?.change).toBe("changed");
    expect(changed?.left).toBe(null);
    expect(changed?.right).toBe(1);
  });

  it("handles missing root on either side", () => {
    expect(buildVersionDiff(undefined, { a: 1 })).toEqual([
      { path: "", left: undefined, right: { a: 1 }, change: "added" },
    ]);
    expect(buildVersionDiff({ a: 1 }, undefined)).toEqual([
      { path: "", left: { a: 1 }, right: undefined, change: "removed" },
    ]);
  });

  it("returns empty list when both sides are undefined", () => {
    expect(buildVersionDiff(undefined, undefined)).toEqual([]);
  });

  it("recurses through deeply nested mixed arrays and objects", () => {
    const left = { plan: { geometry: { coords: [[0, 0], [1, 1]] } } };
    const right = { plan: { geometry: { coords: [[0, 0], [2, 1]] } } };
    const diff = buildVersionDiff(left, right);
    const changed = diff.find((d) => d.change === "changed");
    expect(changed?.path).toBe("plan.geometry.coords[1][0]");
    expect(changed?.left).toBe(1);
    expect(changed?.right).toBe(2);
  });

  it("reports an empty object as unchanged when both sides are equal-empty", () => {
    const diff = buildVersionDiff({ meta: {} }, { meta: {} });
    expect(diff.find((d) => d.path === "meta")).toEqual({
      path: "meta",
      left: {},
      right: {},
      change: "unchanged",
    });
  });
});
