import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";

/** Validates request bodies against the shared Zod contracts. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".");
      throw new BadRequestException({
        message: path ? `${path}: ${issue?.message}` : (issue?.message ?? "Invalid request"),
        issues: result.error.issues.map((item) => ({ path: item.path, message: item.message }))
      });
    }
    return result.data;
  }
}
