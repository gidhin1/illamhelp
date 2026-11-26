package com.illamhelp.api.auth;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth/member-onboarding")
public class MemberOnboardingController {
  private final MemberOnboarding onboarding;

  public MemberOnboardingController(MemberOnboarding onboarding) {
    this.onboarding = onboarding;
  }

  @GetMapping
  public MemberOnboarding.Status status(@AuthenticationPrincipal Jwt token) {
    return onboarding.status(token);
  }

  @PostMapping
  public MemberOnboarding.Status complete(@AuthenticationPrincipal Jwt token,
      @Valid @RequestBody MemberOnboarding.Request request) {
    return onboarding.complete(token, request);
  }
}
