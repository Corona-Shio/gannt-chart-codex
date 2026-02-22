import { describe, expect, it } from "vitest";

import { masterDeleteSchema, taskCreateSchema } from "../lib/api";

describe("taskCreateSchema", () => {
  const base = {
    workspaceId: "123e4567-e89b-12d3-a456-426614174000",
    channelId: "123e4567-e89b-12d3-a456-426614174001",
    taskTypeId: "123e4567-e89b-12d3-a456-426614174002",
    taskName: "編集",
    startDate: "2026-02-10",
    endDate: "2026-02-12",
    scriptNo: "714"
  };

  it("rejects startDate > endDate", () => {
    const result = taskCreateSchema.safeParse({
      ...base,
      startDate: "2026-02-13",
      endDate: "2026-02-12"
    });

    expect(result.success).toBe(false);
  });

  it("requires scriptId or scriptNo", () => {
    const result = taskCreateSchema.safeParse({
      ...base,
      scriptNo: undefined
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid payload", () => {
    const result = taskCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
  });
});

describe("masterDeleteSchema", () => {
  it("accepts valid payload", () => {
    const result = masterDeleteSchema.safeParse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      id: "123e4567-e89b-12d3-a456-426614174111"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid payload", () => {
    const result = masterDeleteSchema.safeParse({
      workspaceId: "invalid",
      id: "123"
    });
    expect(result.success).toBe(false);
  });
});
