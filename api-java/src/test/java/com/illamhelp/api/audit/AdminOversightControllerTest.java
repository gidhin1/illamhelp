package com.illamhelp.api.audit;

import static com.illamhelp.api.TestFixtures.jwt;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.illamhelp.api.profiles.ProfilesService;
import com.illamhelp.api.profiles.VerificationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AdminOversightControllerTest {
  @Test
  void resolvesMemberTimelineAndParsesMetadata() {
    AuditEventRepository repository = mock(AuditEventRepository.class);
    when(repository.memberByUsername("public")).thenReturn(Map.of("userId", "u"));
    when(repository.accessRequests("u", 50)).thenReturn(List.of());
    when(repository.consentGrants("u", 50)).thenReturn(List.of());
    when(repository.timelineEvents("u", 50)).thenReturn(List.of(Map.of("metadata", "{\"requestId\":\"r\"}")));
    AdminOversightController controller = new AdminOversightController(repository, mock(ProfilesService.class),
        mock(VerificationService.class), new ObjectMapper());

    Map<String, Object> response = controller.timeline(new AdminOversightController.TimelineRequest("public", null));
    Map<?, ?> event = (Map<?, ?>) ((List<?>) response.get("auditEvents")).getFirst();
    assertThat(((Map<?, ?>) event.get("metadata")).get("requestId")).isEqualTo("r");
  }

  @Test
  void delegatesVerificationActions() {
    ProfilesService profiles = mock(ProfilesService.class);
    VerificationService verification = mock(VerificationService.class);
    AdminOversightController controller = new AdminOversightController(mock(AuditEventRepository.class), profiles, verification, new ObjectMapper());

    controller.verifyMember("u", new AdminOversightController.VerifyMemberRequest(true));
    controller.reviewVerification("r", new AdminOversightController.VerificationReviewRequest("approved", null), jwt("admin"));
    verify(profiles).setVerified("u", true);
    Map<String, Object> review = new java.util.LinkedHashMap<>();
    review.put("decision", "approved");
    review.put("notes", null);
    verify(verification).review("r", "admin", review);
  }
}
