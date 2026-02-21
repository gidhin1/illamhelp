import { Body, Controller, Get, Post } from "@nestjs/common";

import { Public } from "./decorators/public.decorator";
import { AuthService, AuthSessionResponse } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("register")
  register(@Body() body: RegisterDto): Promise<AuthSessionResponse> {
    return this.authService.register(body);
  }

  @Public()
  @Post("login")
  login(@Body() body: LoginDto): Promise<AuthSessionResponse> {
    return this.authService.login(body);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
