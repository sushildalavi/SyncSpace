import { Controller, Get, Inject, Redirect } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { APP_ENV, type AppEnv } from "./shared/app-env.js";

/** Lets the web app render only the sign-in options that are actually configured. */
@Controller("config")
@Public()
export class ConfigController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get()
  get() {
    return {
      googleEnabled: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET),
      requireEmailVerification: this.env.REQUIRE_EMAIL_VERIFICATION
    };
  }
}

/** Anyone who lands on the API origin (for example from an emailed link without a callback) is sent to the app. */
@Controller()
@Public()
export class RootController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get()
  @Redirect()
  root() {
    return { url: this.env.WEB_ORIGIN, statusCode: 302 };
  }
}
