package ai.sentiprice;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static ai.sentiprice.Data.*;

@Component
class Analytics {
    final Data db;
    final TreeModels trees;
    Analytics(Data db, TreeModels trees) { this.db = db; this.trees = trees; }

    List<Map<String, Object>> models() {
        return List.of(
            model("sentiment", "Sentiment classifier", "Transformer (pretrained)", "loads_on_first_use",
                Transformers.SENTIMENT, Map.of(), "Pretrained DistilBERT (SST-2), loaded on first review."),
            model("emotion", "Emotion classifier", "Transformer (pretrained)", "loads_on_first_use",
                Transformers.EMOTION, Map.of(), "Pretrained DistilRoBERTa, 7 emotion classes."),
            model("fake_review", "Fake-review detector", "XGBoost classifier", "ready", "fake_review_model",
                trees.fake.metrics(), "Held-out split of a documented semi-synthetic dataset."),
            model("demand", "Demand forecaster", "XGBoost regressor + SHAP", "ready", "demand_forecast_model",
                trees.demand.metrics(), "Time-based split on synthetic-but-structured demand history."));
    }

    private Map<String, Object> model(String key, String name, String kind, String status,
                                      String detail, Map<String, Object> metrics, String note) {
        return map("key", key, "name", name, "kind", kind, "status", status, "detail", detail,
            "metrics", metrics, "note", note);
    }

    static final String REVIEW_COUNTS = """
        SELECT count(*) AS reviews_total, count(analyzed_at) AS reviews_analyzed,
          count(*) FILTER (WHERE analysis_error IS NOT NULL AND analyzed_at IS NULL) AS reviews_failed
        FROM reviews
        """;

    Map<String, Object> distribution(String sql, String field, Map<String, Object> defaults) {
        db.rows(sql).forEach(row -> defaults.put(row.get(field).toString(), row.get("count")));
        return defaults;
    }

    Map<String, Object> overview() {
        var result = db.optional("""
            SELECT count(*) AS reviews_total, count(analyzed_at) AS reviews_analyzed,
              count(*) FILTER (WHERE analysis_error IS NOT NULL AND analyzed_at IS NULL) AS reviews_failed,
              count(*) FILTER (WHERE analysis_error IS NULL AND analyzed_at IS NULL) AS reviews_pending,
              count(*) FILTER (WHERE sentiment_label='POSITIVE') AS positive,
              count(*) FILTER (WHERE sentiment_label='NEGATIVE') AS negative,
              avg(sentiment_score) FILTER (WHERE sentiment_label IS NOT NULL) AS average_sentiment_confidence,
              avg(fake_score) AS average_fake_score, count(*) FILTER (WHERE fake_score>=0.5) AS suspicious_reviews
            FROM reviews
            """);
        result.putAll(db.optional("SELECT count(*) AS products_total FROM products"));
        result.put("rating_distribution", distribution("SELECT rating,count(*) FROM reviews GROUP BY rating",
            "rating", map("1", 0, "2", 0, "3", 0, "4", 0, "5", 0)));
        result.put("emotion_distribution", distribution("""
            SELECT emotion_label,count(*) FROM reviews WHERE emotion_label IS NOT NULL GROUP BY emotion_label
            """, "emotion_label", map()));
        result.put("by_category", db.rows("""
            SELECT p.category, count(DISTINCT p.id) AS products, count(r.id) AS reviews, avg(r.rating) AS average_rating,
              count(*) FILTER (WHERE r.sentiment_label='POSITIVE') AS positive,
              count(*) FILTER (WHERE r.sentiment_label='NEGATIVE') AS negative
            FROM products p LEFT JOIN reviews r ON r.product_id=p.id GROUP BY p.category ORDER BY p.category
            """));
        result.put("aspects", db.rows("""
            SELECT aspect,count(*) FILTER (WHERE sentiment_label='POSITIVE') AS positive,
              count(*) FILTER (WHERE sentiment_label='NEGATIVE') AS negative
            FROM review_aspect_sentiments GROUP BY aspect ORDER BY count(*) DESC,aspect LIMIT 8
            """));
        var counts = distribution("""
            SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, count(*)
            FROM reviews WHERE created_at >= current_date - 13 GROUP BY day
            """, "day", map());
        List<Map<String, Object>> daily = new ArrayList<>();
        LocalDate date = LocalDate.now(java.time.ZoneOffset.UTC);
        for (int i = 13; i >= 0; i--) {
            String day = date.minusDays(i).toString();
            daily.add(map("date", day, "reviews", counts.getOrDefault(day, 0)));
        }
        result.put("reviews_per_day", daily);
        return result;
    }
}

@RestController
@RequestMapping("/api/v1/analytics")
class AnalyticsRoutes {
    final Auth auth;
    final Analytics analytics;
    AnalyticsRoutes(Auth auth, Analytics analytics) { this.auth = auth; this.analytics = analytics; }

    @GetMapping("/overview")
    Object overview(HttpServletRequest req) {
        auth.require(req, "ADMIN", "ANALYST");
        return analytics.overview();
    }

    @GetMapping("/model-performance")
    Object performance(HttpServletRequest req) {
        auth.require(req, "ADMIN", "ANALYST");
        return map("models", analytics.models());
    }
}

@RestController
@RequestMapping("/api/v1/admin")
class AdminRoutes {
    final Data db;
    final Auth auth;
    final Analytics analytics;
    final Events events;
    AdminRoutes(Data db, Auth auth, Analytics analytics, Events events) {
        this.db = db; this.auth = auth; this.analytics = analytics; this.events = events;
    }

    @GetMapping("/ping")
    Object ping(HttpServletRequest req) {
        var user = auth.require(req, "ADMIN");
        return map("ok", true, "message", "Access granted to " + user.get("email") + " as " + user.get("role"));
    }

    @GetMapping("/users")
    Object users(HttpServletRequest req) {
        auth.require(req, "ADMIN");
        return db.rows("SELECT " + Auth.USERS + " FROM users ORDER BY created_at DESC");
    }

    @PatchMapping("/users/{id}")
    @Transactional
    public Object updateUser(HttpServletRequest req, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        db.rows("SELECT id FROM users WHERE role='ADMIN' ORDER BY id FOR UPDATE");
        var admin = auth.require(req, "ADMIN");
        var target = db.required("User not found.", "SELECT " + Auth.USERS + " FROM users WHERE id=? FOR UPDATE", id);
        String role = body.get("role") == null ? target.get("role").toString() : auth.role(body);
        Object active = body.get("is_active") == null ? target.get("is_active") : body.get("is_active");
        if (!(active instanceof Boolean enabled)) throw error(422, "Invalid is_active.");
        if (id.equals(admin.get("id"))) {
            if (!role.equals(target.get("role"))) throw error(400, "You cannot change your own role.");
            if (!enabled) throw error(400, "You cannot deactivate your own account.");
        }
        if ("ADMIN".equals(target.get("role")) && (!"ADMIN".equals(role) || !enabled)
            && db.optional("SELECT id FROM users WHERE role='ADMIN' AND is_active AND id<>? LIMIT 1", id) == null)
            throw error(400, "At least one active ADMIN must remain.");
        return db.optional("UPDATE users SET role=?::role_enum,is_active=? WHERE id=? RETURNING " + Auth.USERS,
            role, enabled, id);
    }

    @GetMapping("/stats")
    Object stats(HttpServletRequest req) {
        auth.require(req, "ADMIN");
        var result = db.optional(Analytics.REVIEW_COUNTS);
        result.putAll(db.optional("SELECT count(*) AS users_total,count(*) FILTER (WHERE is_active) AS users_active FROM users"));
        result.putAll(db.optional("SELECT count(*) AS products_total,count(image_url) AS products_with_image FROM products"));
        result.putAll(db.optional("SELECT count(*) AS alerts_unread FROM alerts WHERE NOT is_read"));
        result.put("users_by_role", analytics.distribution("SELECT role::text AS role,count(*) FROM users GROUP BY role",
            "role", map("ADMIN", 0, "ANALYST", 0, "BUSINESS_USER", 0)));
        result.put("websocket_connections", events.sessions.size());
        result.put("models", analytics.models());
        return result;
    }
}
