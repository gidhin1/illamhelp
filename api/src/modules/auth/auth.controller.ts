import { Body, Controller, Get, Post } from "@nestjs/common";

import { Public } from "./decorators/public.decorator";
import { AuthService, AuthSessionResponse } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import { UserType } from "./interfaces/user-type.enum";
import { ProfilesService } from "../profiles/profiles.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly profilesService: ProfilesService
  ) { }

  @Public()
  @Post("register")
  async register(@Body() body: RegisterDto): Promise<AuthSessionResponse> {
    const session = await this.authService.register(body);
    await this.profilesService.upsertFromRegistration({
      userId: session.userId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      userType: UserType.BOTH
    });
    return session;
  }

  @Public()
  @Post("login")
  login(@Body() body: LoginDto): Promise<AuthSessionResponse> {
    return this.authService.login(body);
  }

  @Public()
  @Post("refresh")
  refresh(@Body() body: RefreshDto): Promise<AuthSessionResponse> {
    return this.authService.refreshAccessToken(body.refreshToken);
  }

  @Public()
  @Post("logout")
  async logout(@Body() body: RefreshDto): Promise<{ success: boolean }> {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
