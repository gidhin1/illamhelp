package com.illamhelp.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

class RedisRateLimitStoreTest {
  @Test
  void namespacesKeysAndAllowsRequestsWithinTheDistributedLimit() {
    StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    when(redisTemplate.execute(any(), eq(List.of("illamhelp:rate:auth-login:client")), eq("60000")))
        .thenReturn(2L);
    RedisRateLimitStore store = new RedisRateLimitStore(redisTemplate);

    assertThat(store.consume("auth-login:client", 60000, 2)).isTrue();

    verify(redisTemplate).execute(any(), eq(List.of("illamhelp:rate:auth-login:client")), eq("60000"));
  }

  @Test
  void rejectsOverLimitAndUnavailableRedisResults() {
    StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    RedisRateLimitStore store = new RedisRateLimitStore(redisTemplate);
    when(redisTemplate.execute(any(), eq(List.of("illamhelp:rate:search:client")), eq("1000")))
        .thenReturn(4L, null);

    assertThat(store.consume("search:client", 1000, 3)).isFalse();
    assertThat(store.consume("search:client", 1000, 3)).isFalse();
  }
}
