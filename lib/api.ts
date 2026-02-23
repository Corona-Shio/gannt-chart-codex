import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskCreateSchema = z
  .object({
    workspaceId: z.string().uuid(),
    channelId: z.string().uuid(),
    scriptId: z.string().uuid().optional(),
    scriptNo: z.string().min(1).optional(),
    scriptTitle: z.string().optional(),
    taskTypeId: z.string().uuid(),
    statusId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    taskName: z.string().min(1),
    startDate: dateSchema,
    endDate: dateSchema,
    notes: z.string().optional()
  })
  .refine((value) => value.scriptId || value.scriptNo, {
    message: "scriptId or scriptNo is required",
    path: ["scriptId"]
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "startDate must be <= endDate",
    path: ["endDate"]
  });

export const taskPatchSchema = z
  .object({
    workspaceId: z.string().uuid(),
    channelId: z.string().uuid().optional(),
    scriptId: z.string().uuid().optional(),
    scriptNo: z.string().optional(),
    scriptTitle: z.string().optional(),
    taskTypeId: z.string().uuid().optional(),
    statusId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    taskName: z.string().min(1).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    notes: z.string().nullable().optional()
  })
  .refine(
    (value) => {
      if (value.startDate && value.endDate) {
        return value.startDate <= value.endDate;
      }
      return true;
    },
    {
      message: "startDate must be <= endDate",
      path: ["endDate"]
    }
  );

export const releaseDateCreateSchema = z
  .object({
    workspaceId: z.string().uuid(),
    channelId: z.string().uuid(),
    scriptId: z.string().uuid().optional(),
    scriptNo: z.string().min(1).optional(),
    scriptTitle: z.string().optional(),
    releaseDate: dateSchema,
    label: z.string().optional()
  })
  .refine((value) => value.scriptId || value.scriptNo, {
    message: "scriptId or scriptNo is required",
    path: ["scriptId"]
  });

export const releaseDatePatchSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  releaseDate: dateSchema.optional(),
  label: z.string().nullable().optional()
});

export const releaseDateDeleteSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid()
});

export const masterCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDone: z.boolean().optional()
});

export const masterPatchSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDone: z.boolean().optional()
});

export const masterDeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid()
});

export function parseCsvParam(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}
