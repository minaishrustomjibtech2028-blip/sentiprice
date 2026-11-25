package ai.sentiprice;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import static ai.sentiprice.Data.map;

@RestController
class StatusRoutes {
    final Data db;
    StatusRoutes(Data db) { this.db = db; }

    @GetMapping("/")
    Object root() {
        return map("message", "SentiPrice AI backend is running", "docs", "/docs", "health", "/api/v1/health");
    }

    @GetMapping("/api/v1/health")
    Object health() {
        db.optional("SELECT 1");
        return map("status", "ok", "service", "SentiPrice AI backend", "database", "connected");
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(map("detail", e.getReason()));
    }
}
