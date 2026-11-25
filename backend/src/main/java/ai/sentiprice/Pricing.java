package ai.sentiprice;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import static ai.sentiprice.Data.*;
import static ai.sentiprice.TreeModels.rounded;

@Component
class Pricing {
    final Data db;
    final TreeModels models;
    Pricing(Data db, TreeModels models) { this.db = db; this.models = models; }

    Map<String, Object> summary(UUID id) {
        var result = db.optional("""
            SELECT count(sentiment_label) AS analyzed_review_count,
              count(*) FILTER (WHERE sentiment_label='POSITIVE') AS positive_count,
              count(*) FILTER (WHERE sentiment_label='NEGATIVE') AS negative_count,
              avg(sentiment_score) FILTER (WHERE sentiment_label IS NOT NULL) AS average_sentiment_score,
              sum(coalesce(fake_score,0)) FILTER (WHERE sentiment_label IS NOT NULL)
                / nullif(count(sentiment_label),0) AS average_fake_score, avg(rating) AS average_rating
            FROM reviews WHERE product_id=?
            """, id);
        result.put("product_id", id);
        result.put("top_aspects", db.rows("""
            SELECT a.aspect,count(*) AS mentions FROM review_aspect_sentiments a
            JOIN reviews r ON r.id=a.review_id WHERE r.product_id=? AND r.sentiment_label IS NOT NULL
            GROUP BY a.aspect ORDER BY mentions DESC,a.aspect LIMIT 5
            """, id));
        return result;
    }

    record Adjustment(double pct, String confidence, List<String> reasoning) {}

    Adjustment sentiment(UUID id) {
        var summary = summary(id);
        double count = number(summary, "analyzed_review_count");
        if (count == 0) return new Adjustment(0, "none", List.of("No analyzed reviews yet for this product."));
        double positive = number(summary, "positive_count"), negative = number(summary, "negative_count");
        double mix = positive + negative == 0 ? 0 : (positive - negative) / (positive + negative);
        double confidence = number(summary, "average_sentiment_score"), fake = number(summary, "average_fake_score");
        double sentiment = mix * confidence * .06, ratio = mix * .04;
        double rating = number(summary, "average_rating"), stars = (rating - 3) / 2 * .03;
        List<String> reasoning = new ArrayList<>();
        if (positive + negative > 0) {
            reasoning.add(format("Sentiment: %.0f positive vs %.0f negative reviews (avg confidence %.2f) → %+.2f%%",
                positive, negative, confidence, sentiment * 100));
            reasoning.add(format("Review mix ratio → %+.2f%%", ratio * 100));
        }
        reasoning.add(format("Average rating %.1f/5 → %+.2f%%", rating, stars * 100));
        double trust = clamp(1 - fake, .2, 1);
        if (fake > .3) reasoning.add(format("Fake-review suspicion averaging %.2f reduced confidence by %.0f%%", fake, (1 - trust) * 100));
        double raw = (sentiment + ratio + stars) * trust;
        double adjustment = clamp(raw, -.15, .10);
        if (raw != adjustment) reasoning.add("Adjustment clamped to policy bounds [-15%, 10%].");
        return new Adjustment(adjustment, count < 3 ? "low" : count < 10 ? "medium" : "high", reasoning);
    }

    Map<String, Object> forecast(Map<String, Object> product) {
        double price = number(product, "current_price"), base = number(product, "base_price");
        String category = product.get("category").toString();
        List<Map<String, Object>> days = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (int i = 1; i <= 7; i++) {
            var day = today.plusDays(i);
            days.add(map("date", day.toString(), "predicted_units", rounded(models.predictDemand(day, price, base, category), 1)));
        }
        return map("product_id", product.get("id"), "category", category, "price_used", product.get("current_price").toString(),
            "days", days, "forecast_model_test_mae", null, "forecast_model_test_r2", null);
    }

    Map<String, Object> recommendation(Map<String, Object> product, Map<String, Object> overrides, boolean ml) {
        UUID id = (UUID) product.get("id");
        BigDecimal base = overrides.get("hypothetical_base_price") == null ? (BigDecimal) product.get("base_price")
            : price(overrides, "hypothetical_base_price");
        Adjustment sentiment = sentiment(id);
        List<String> reasoning = new ArrayList<>();
        double adjustment = sentiment.pct;
        var result = map("product_id", id, "current_price", product.get("current_price").toString(), "base_price", base.toPlainString(),
            "confidence", sentiment.confidence, "reasoning", reasoning, "is_interim_heuristic", !ml);
        if (ml) {
            var average = db.optional("SELECT round(avg(price),2) AS price FROM competitor_prices WHERE product_id=?", id);
            BigDecimal competitor = overrides.get("hypothetical_competitor_avg_price") == null
                ? (BigDecimal) average.get("price") : price(overrides, "hypothetical_competitor_avg_price");
            var inventory = db.optional("SELECT stock_level,reorder_threshold FROM inventory WHERE product_id=?", id);
            Integer stock = overrides.get("hypothetical_stock_level") == null
                ? (inventory == null ? null : (Integer) inventory.get("stock_level"))
                : Integer.valueOf(integer(overrides, "hypothetical_stock_level", 0, Integer.MAX_VALUE));
            Integer threshold = inventory == null ? null : (Integer) inventory.get("reorder_threshold");
            String category = product.get("category").toString();
            var today = LocalDate.now();
            List<BigDecimal> grid = new ArrayList<>();
            for (int pct = -15; pct <= 10; pct++) grid.add(multiplied(base, pct / 100.0));
            if (competitor != null) {
                var floor = competitor.multiply(new BigDecimal("0.85"));
                var ceiling = competitor.multiply(new BigDecimal("1.15"));
                var feasible = grid.stream().filter(p -> p.compareTo(floor) >= 0 && p.compareTo(ceiling) <= 0).toList();
                if (!feasible.isEmpty()) grid = feasible;
                reasoning.add("Competitor average price: $" + competitor + (feasible.isEmpty()
                    ? " is too far from the base price to enforce within policy bounds." : ""));
            }
            BigDecimal best = base;
            double bestRevenue = -1, units = 0;
            for (BigDecimal candidate : grid) {
                double predicted = models.predictDemand(today, candidate.doubleValue(), base.doubleValue(), category);
                double revenue = candidate.doubleValue() * predicted;
                if (revenue > bestRevenue) {
                    best = candidate;
                    units = predicted;
                    bestRevenue = revenue;
                }
            }
            if (stock != null && threshold != null && stock <= threshold) {
                reasoning.add("Inventory: stock (" + stock + ") is at or below the reorder threshold (" + threshold + ").");
                if (best.compareTo(base) < 0) {
                    best = base;
                    units = models.predictDemand(today, best.doubleValue(), base.doubleValue(), category);
                }
            }
            reasoning.addFirst(format("Demand model: at $%s, predicted demand is %.1f units/day (base price $%s).", best, units, base));
            double preferred = base.signum() == 0 ? 0 : (best.doubleValue() - base.doubleValue()) / base.doubleValue();
            double nudge = clamp(preferred, -.02, .02);
            reasoning.add("Review sentiment (main factor): " + String.join(". ", sentiment.reasoning));
            reasoning.add(format("Demand nudge: model preference %+.1f%%, limited to %+.1f%%.", preferred * 100, nudge * 100));
            adjustment = clamp(adjustment + nudge, -.15, .10);
            result.putAll(map("ml_optimal_price", best.toPlainString(), "predicted_demand_units", rounded(units, 1),
                "shap_breakdown", models.explain(today, best.doubleValue(), base.doubleValue(), category),
                "competitor_avg_price", competitor == null ? null : competitor.toPlainString()));
        } else {
            reasoning.addAll(sentiment.reasoning);
        }
        result.put("recommended_price", multiplied(base, adjustment).toPlainString());
        result.put("adjustment_pct", adjustment);
        return result;
    }

    static String format(String format, Object... args) { return String.format(Locale.ROOT, format, args); }
    static double clamp(double v, double min, double max) { return Math.max(min, Math.min(max, v)); }
    static BigDecimal multiplied(BigDecimal base, double adjustment) {
        return base.multiply(BigDecimal.valueOf(1 + adjustment)).setScale(2, RoundingMode.HALF_UP);
    }
}

@RestController
@RequestMapping("/api/v1/products/{id}")
class PricingRoutes {
    final Auth auth;
    final Products products;
    final Pricing pricing;
    final Data db;
    final Events events;

    PricingRoutes(Auth auth, Products products, Pricing pricing, Data db, Events events) {
        this.auth = auth; this.products = products; this.pricing = pricing; this.db = db; this.events = events;
    }

    @GetMapping("/forecast")
    Object forecast(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req);
        return pricing.forecast(products.product(id));
    }

    @GetMapping("/price-recommendation")
    Object interim(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN", "ANALYST");
        return pricing.recommendation(products.product(id), Map.of(), false);
    }

    @GetMapping("/price-recommendation-ml")
    Object recommend(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN", "ANALYST");
        return pricing.recommendation(products.product(id), Map.of(), true);
    }

    @PostMapping("/price-simulate")
    Object simulate(HttpServletRequest req, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        auth.require(req, "ADMIN", "ANALYST");
        return pricing.recommendation(products.product(id), body, true);
    }

    @PostMapping("/apply-recommended-price")
    Object apply(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN");
        var recommendation = pricing.recommendation(products.product(id), Map.of(), true);
        return decimalStrings(db.required("Product not found.", """
            UPDATE products SET current_price=?,updated_at=now() WHERE id=? RETURNING *
            """, new BigDecimal(recommendation.get("recommended_price").toString()), id));
    }

    @GetMapping("/competitor-prices")
    Object competitors(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN", "ANALYST");
        products.product(id);
        return db.rows("SELECT * FROM competitor_prices WHERE product_id=? ORDER BY recorded_at DESC", id)
            .stream().map(Data::decimalStrings).toList();
    }

    @PostMapping("/competitor-prices")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    Object addCompetitor(HttpServletRequest req, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        auth.require(req, "ADMIN");
        products.product(id);
        return decimalStrings(db.optional("""
            INSERT INTO competitor_prices(id,product_id,competitor_name,price,recorded_at)
            VALUES (?,?,?,?,now()) RETURNING *
            """, UUID.randomUUID(), id, string(body, "competitor_name", 1, 255), price(body, "price")));
    }

    static final String INVENTORY = "product_id,stock_level,reorder_threshold,updated_at,stock_level<=reorder_threshold AS is_low_stock";

    @GetMapping("/inventory")
    Object inventory(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN", "ANALYST");
        products.product(id);
        return db.required("No inventory record for this product yet.", "SELECT " + INVENTORY + " FROM inventory WHERE product_id=?", id);
    }

    @PutMapping("/inventory")
    Object inventory(HttpServletRequest req, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        auth.require(req, "ADMIN");
        products.product(id);
        int stock = integer(body, "stock_level", 0, Integer.MAX_VALUE);
        int threshold = integer(body, "reorder_threshold", 0, Integer.MAX_VALUE);
        var row = db.optional("""
            INSERT INTO inventory(id,product_id,stock_level,reorder_threshold,updated_at) VALUES (?,?,?,?,now())
            ON CONFLICT (product_id) DO UPDATE SET stock_level=excluded.stock_level,
              reorder_threshold=excluded.reorder_threshold,updated_at=excluded.updated_at RETURNING
            """ + INVENTORY, UUID.randomUUID(), id, stock, threshold);
        events.broadcast("inventory_updated", row);
        if (stock <= threshold) events.alert(id, "low_stock", "Stock (" + stock + ") is at or below the reorder threshold (" + threshold + ").",
            stock == 0 ? "critical" : "warning");
        return row;
    }
}
