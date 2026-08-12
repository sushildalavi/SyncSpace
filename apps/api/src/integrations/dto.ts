import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsNotEmpty, IsString, IsUrl } from "class-validator";

export class UpsertIntegrationDto {
  @IsIn(["slack", "teams"])
  provider!: "slack" | "teams";

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({ require_tld: false })
  webhookUrl!: string;

  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  enabled!: boolean;
}

export class SendIntegrationMessageDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  summary!: string;

  @IsString()
  @IsNotEmpty()
  documentUrl!: string;
}
