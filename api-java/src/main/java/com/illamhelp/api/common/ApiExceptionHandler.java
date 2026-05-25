package com.illamhelp.api.common;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<ApiErrorPayload> handleApiException(ApiException exception) {
    return error(exception.status(), exception.getMessage());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiErrorPayload> handleValidation(MethodArgumentNotValidException exception) {
    List<String> messages = exception.getBindingResult().getFieldErrors().stream()
        .map(this::formatFieldError)
        .toList();
    return ResponseEntity.badRequest()
        .body(new ApiErrorPayload(400, messages, "Bad Request"));
  }

  @ExceptionHandler(ConstraintViolationException.class)
  ResponseEntity<ApiErrorPayload> handleConstraintViolation(ConstraintViolationException exception) {
    return error(HttpStatus.BAD_REQUEST, exception.getMessage());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiErrorPayload> handleUnhandled(Exception exception) {
    return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
  }

  private String formatFieldError(FieldError error) {
    return error.getField() + " " + (error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage());
  }

  private ResponseEntity<ApiErrorPayload> error(HttpStatus status, String message) {
    return ResponseEntity.status(status)
        .body(new ApiErrorPayload(status.value(), message, status.getReasonPhrase()));
  }

  public record ApiErrorPayload(int statusCode, Object message, String error) {
  }
}
