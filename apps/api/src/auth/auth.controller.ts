import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { LoginDto, RegisterDto } from "./dto.js";
import { JwtAuthGuard } from "../common/jwt-auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }
}
