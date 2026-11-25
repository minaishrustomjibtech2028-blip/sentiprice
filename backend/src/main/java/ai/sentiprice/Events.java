package ai.sentiprice;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import static ai.sentiprice.Data.*;

@Component
class Events extends TextWebSocketHandler {
    final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    final Data db;
    final Auth auth;
    final ObjectMapper json;

    Events(Data db, Auth auth, ObjectMapper json) {
        this.db = db; this.auth = auth; this.json = json;
    }

    @Override public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        try {
            var token = UriComponentsBuilder.fromUri(session.getUri()).build().getQueryParams().getFirst("token");
            auth.authenticate(token, "access");
            sessions.put(session.getId(), new ConcurrentWebSocketSessionDecorator(session, 5_000, 256 * 1024));
        } catch (RuntimeException e) {
            session.close(CloseStatus.POLICY_VIOLATION);
        }
    }

    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
    }

    void broadcast(String type, Object payload) {
        if (sessions.isEmpty()) return;
        try {
            var message = new TextMessage(json.writeValueAsString(map("type", type, "payload", payload)));
            sessions.forEach((id, session) -> {
                try {
                    session.sendMessage(message);
                } catch (IOException | IllegalStateException e) {
                    sessions.remove(id);
                    try { session.close(); } catch (IOException ignored) { }
                }
            });
        } catch (IOException e) {
            org.slf4j.LoggerFactory.getLogger(Events.class).warn("Could not encode live event " + type, e);
        }
    }

    void alert(UUID product, String type, String message, String severity) {
        var row = db.optional("""
            INSERT INTO alerts(id,product_id,alert_type,message,severity,is_read,created_at)
            VALUES (?,?,?,?,?,false,now()) RETURNING *
            """, UUID.randomUUID(), product, type, message, severity);
        broadcast("alert_created", row);
    }
}

@Configuration
@EnableWebSocket
class LiveSocket implements WebSocketConfigurer {
    final Events events;
    LiveSocket(Events events) { this.events = events; }

    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(events, "/api/v1/ws/live").setAllowedOrigins(System.getenv().getOrDefault(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","));
    }
}

@RestController
@RequestMapping("/api/v1/alerts")
class AlertRoutes {
    final Data db;
    final Auth auth;
    AlertRoutes(Data db, Auth auth) { this.db = db; this.auth = auth; }

    @GetMapping
    Object alerts(HttpServletRequest req, @RequestParam(defaultValue = "false") boolean unread_only) {
        auth.require(req);
        return db.rows("SELECT * FROM alerts " + (unread_only ? "WHERE NOT is_read " : "") + "ORDER BY created_at DESC");
    }

    @PatchMapping("/{id}/read")
    Object read(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req);
        return db.required("Alert not found.", "UPDATE alerts SET is_read=true WHERE id=? RETURNING *", id);
    }

    @PostMapping("/read-all")
    Object readAll(HttpServletRequest req) {
        auth.require(req);
        return map("updated", db.update("UPDATE alerts SET is_read=true WHERE NOT is_read"));
    }
}
