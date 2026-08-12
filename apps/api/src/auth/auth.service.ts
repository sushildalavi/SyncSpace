import { BadRequestException, Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database/database.service.js";
import { APP_ENV } from "../shared/app-env.js";
import type { AuthenticatedUser } from "../common/current-user.decorator.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_ENV) private readonly env: { JWT_SECRET: string; JWT_EXPIRES_IN: string }
  ) {}

  async register(input: { email: string; password: string; displayName: string }): Promise<{ token: string; user: AuthenticatedUser }> {
    const existing = await this.database.models.users.findOne({ email: input.email.toLowerCase() }).lean();
    if (existing) {
      throw new BadRequestException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.database.models.users.create({
      email: input.email.toLowerCase(),
      passwordHash,
      displayName: input.displayName
    });

    const userPayload = { id: user._id, email: user.email, displayName: user.displayName };
    return { token: this.sign(userPayload), user: userPayload };
  }

  async login(input: { email: string; password: string }): Promise<{ token: string; user: AuthenticatedUser }> {
    const user = await this.database.models.users.findOne({ email: input.email.toLowerCase() });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const userPayload = { id: user._id, email: user.email, displayName: user.displayName };
    return { token: this.sign(userPayload), user: userPayload };
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.database.models.users.findById(userId).lean();
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return { id: user._id, email: user.email, displayName: user.displayName };
  }

  private sign(user: AuthenticatedUser): string {
    return jwt.sign(user, this.env.JWT_SECRET, {
      expiresIn: this.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
    });
  }
}
