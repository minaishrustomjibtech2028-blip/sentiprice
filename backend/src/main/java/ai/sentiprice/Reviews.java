package ai.sentiprice;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import static ai.sentiprice.Data.*;
import static ai.sentiprice.Pricing.format;

@Component
class ReviewAnalysis {
    static final Map<String, List<String>> KEYWORDS = Map.ofEntries(
        Map.entry("battery", List.of("battery", "charge", "charging")),
        Map.entry("price", List.of("price", "value", "expensive", "cheap", "cost", "worth")),
        Map.entry("quality", List.of("quality", "build", "material", "sturdy", "flimsy")),
        Map.entry("delivery", List.of("delivery", "shipping", "arrived", "shipped", "packaging")),
        Map.entry("size", List.of("size", "fit", "sizing", "small", "large", "tight", "loose")),
        Map.entry("sound", List.of("sound", "audio", "volume", "speaker", "noise")),
        Map.entry("comfort", List.of("comfort", "comfortable", "ergonomic")),
        Map.entry("durability", List.of("durable", "broke", "broken", "lasted", "sturdy")),
        Map.entry("customer service", List.of("support", "service", "customer service", "warranty")),
        Map.entry("appearance", List.of("color", "colour", "design", "look", "looks")),
        Map.entry("ease of use", List.of("easy", "difficult", "setup", "instructions", "intuitive")));

    final Data db;
    final Transformers nlp;
    final TreeModels models;
    final Pricing pricing;
    final Products products;
    final Events events;
    final TransactionTemplate transaction;
    final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ReviewAnalysis.class);

    ReviewAnalysis(Data db, Transformers nlp, TreeModels models, Pricing pricing, Products products,
                   Events events, TransactionTemplate transaction) {
        this.db = db; this.nlp = nlp; this.models = models; this.pricing = pricing;
        this.products = products; this.events = events; this.transaction = transaction;
    }

    private final Set<UUID> active = ConcurrentHashMap.newKeySet();

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void resumePendingReviews() {
        for (var review : db.rows("SELECT id FROM reviews WHERE analyzed_at IS NULL AND analysis_error IS NULL ORDER BY created_at")) {
            analyze((UUID) review.get("id"));
        }
    }

    @Async
    public void background(UUID id) { analyze(id); }

    Map<String, Object> withAspects(Map<String, Object> row) {
        row.put("aspects", db.rows("""
            SELECT aspect,sentiment_label,sentiment_score,evidence_text FROM review_aspect_sentiments
            WHERE review_id=? ORDER BY aspect,evidence_text
            """, row.get("id")));
        return row;
    }

    Map<String, Object> analyze(UUID id) {
        if (!active.add(id)) {
            var current = db.optional("SELECT * FROM reviews WHERE id=?", id);
            return current == null ? null : withAspects(current);
        }
        try {
            return runAnalysis(id);
        } finally {
            active.remove(id);
        }
    }

    private Map<String, Object> runAnalysis(UUID id) {
        var row = db.optional("SELECT * FROM reviews WHERE id=?", id);
        if (row == null) return null;
        String content = row.get("content").toString();
        UUID productId = (UUID) row.get("product_id");
        int rating = (Integer) row.get("rating");
        Transformers.Prediction sentiment;
        double fake;
        try {
            sentiment = nlp.sentiment(content);
            var emotion = nlp.emotion(content);
            fake = models.fakeScore(content, rating);
            var aspects = aspects(content);
            row = transaction.execute(status -> {
                var result = db.optional("""
                    UPDATE reviews SET sentiment_label=?,sentiment_score=?,emotion_label=?,emotion_score=?,
                      fake_score=?,analyzed_at=now(),analysis_error=NULL WHERE id=? RETURNING *
                    """, sentiment.label(), sentiment.confidence(), emotion.label(), emotion.confidence(), fake, id);
                if (result == null) return null;
                db.update("DELETE FROM review_aspect_sentiments WHERE review_id=?", id);
                for (var aspect : aspects) {
                    db.update("""
                        INSERT INTO review_aspect_sentiments(id,review_id,aspect,sentiment_label,sentiment_score,evidence_text)
                        VALUES (?,?,?,?,?,?)
                        """, UUID.randomUUID(), id, aspect.get("aspect"), aspect.get("sentiment_label"),
                        aspect.get("sentiment_score"), aspect.get("evidence_text"));
                }
                result.put("aspects", aspects);
                return result;
            });
        } catch (Exception | LinkageError e) {
            log.warn("Review analysis failed for {}", id, e);
            String message = "Analysis unavailable: " + Objects.toString(e.getMessage(), e.getClass().getSimpleName());
            var failed = db.optional("UPDATE reviews SET analysis_error=? WHERE id=? RETURNING *", message, id);
            if (failed == null) return null;
            events.broadcast("review_analysis_failed", map("review_id", id, "error", message));
            return withAspects(failed);
        }
        if (row == null) return null;
        events.broadcast("review_analyzed", row);
        try {
            if (sentiment.label().equals("NEGATIVE") && sentiment.confidence() >= .75)
                events.alert(productId, "negative_review", format("A review with %.0f%% confidence negative sentiment was posted (rating: %d/5).",
                    sentiment.confidence() * 100, rating), "warning");
            if (fake >= .7)
                events.alert(productId, "suspicious_review",
                    format("A review was flagged as %.0f%% likely suspicious/fake.", fake * 100), "warning");
            transaction.executeWithoutResult(status -> {
                var product = db.optional("SELECT * FROM products WHERE id=? FOR UPDATE", productId);
                if (product == null) return;
                var recommendation = pricing.recommendation(product, Map.of(), true);
                db.update("UPDATE products SET current_price=?,updated_at=now() WHERE id=?",
                    new BigDecimal(recommendation.get("recommended_price").toString()), productId);
            });
        } catch (RuntimeException e) {
            log.warn("Could not refresh alerts or pricing for analyzed review {}", id, e);
        }
        return row;
    }

    private List<Map<String, Object>> aspects(String content) throws Exception {
        List<Map<String, Object>> result = new ArrayList<>();
        for (String part : content.split("(?<=[.!?])\\s+|,?\\s+\\b(?:but|however|although|though)\\b\\s*")) {
            String clause = part.strip();
            String lower = clause.toLowerCase(Locale.ROOT);
            var matched = KEYWORDS.entrySet().stream().filter(entry -> entry.getValue().stream().anyMatch(lower::contains))
                .map(Map.Entry::getKey).sorted().toList();
            if (matched.isEmpty()) continue;
            var prediction = nlp.sentiment(clause);
            for (String name : matched) result.add(map("aspect", name, "sentiment_label", prediction.label(),
                "sentiment_score", prediction.confidence(), "evidence_text", clause));
        }
        return result;
    }
}

@RestController
@RequestMapping("/api/v1/products/{productId}/reviews")
class Reviews {
    final Data db;
    final Auth auth;
    final Products products;
    final ReviewAnalysis analysis;
    final Pricing pricing;

    Reviews(Data db, Auth auth, Products products, ReviewAnalysis analysis, Pricing pricing) {
        this.db = db; this.auth = auth; this.products = products; this.analysis = analysis; this.pricing = pricing;
    }

    @GetMapping
    Object list(HttpServletRequest req, @PathVariable UUID productId) {
        auth.require(req);
        products.product(productId);
        return db.rows("SELECT * FROM reviews WHERE product_id=? ORDER BY created_at DESC", productId)
            .stream().map(analysis::withAspects).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Object submit(HttpServletRequest req, @PathVariable UUID productId, @RequestBody Map<String, Object> body) {
        var user = auth.require(req);
        products.product(productId);
        UUID id = UUID.randomUUID();
        var row = db.optional("""
            INSERT INTO reviews(id,product_id,user_id,reviewer_display_name,content,rating,created_at)
            VALUES (?,?,?,?,?,?,now()) RETURNING *
            """, id, productId, user.get("id"), user.get("full_name"), string(body, "content", 1, 5000),
            integer(body, "rating", 1, 5));
        row.put("aspects", List.of());
        analysis.background(id);
        return row;
    }

    @PostMapping("/{id}/reanalyze")
    Object reanalyze(HttpServletRequest req, @PathVariable UUID productId, @PathVariable UUID id) {
        auth.require(req, "ADMIN", "ANALYST");
        db.required("Review not found.", "SELECT id FROM reviews WHERE id=? AND product_id=?", id, productId);
        var row = analysis.analyze(id);
        if (row == null) throw error(404, "Review not found.");
        return row;
    }

    @GetMapping("/sentiment-summary")
    Object summary(HttpServletRequest req, @PathVariable UUID productId) {
        auth.require(req);
        products.product(productId);
        return pricing.summary(productId);
    }
}
