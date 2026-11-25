package ai.sentiprice;

import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.*;
import static ai.sentiprice.Data.*;
import static ai.sentiprice.Pricing.format;

@RestController
@RequestMapping("/api/v1/copilot")
class Copilot {
    private static final Set<String> STOP = Set.of(("the a an of for and or to is are what how about me my show tell give "
        + "please with in on at this that do does should we i it its price prices review reviews product products forecast "
        + "demand sentiment competitor competitors recommend recommended recommendation customers customer say think which low "
        + "stock inventory top best worst rated highest lowest negative suspicious fake alert alerts unread many recent latest "
        + "running out restock complaints popular rating ratings").split(" "));
    final Auth auth;
    final Data db;
    final Pricing pricing;

    Copilot(Auth auth, Data db, Pricing pricing) { this.auth = auth; this.db = db; this.pricing = pricing; }

    @GetMapping("/suggestions")
    Object suggestions(HttpServletRequest req) { return suggestions(auth.require(req).get("role").toString()); }

    private List<String> suggestions(String role) {
        String top = "What are the top rated products?", negative = "Show recent negative reviews";
        if ("BUSINESS_USER".equals(role)) return List.of(top, negative, "What are the lowest rated products?",
            "Show unread alerts", "How many products do we have?");
        return List.of("Which products are low on stock?", top, negative, "Are there any suspicious reviews?",
            "ADMIN".equals(role) ? "How many products do we have?" : "Show unread alerts");
    }

    @PostMapping("/ask")
    Object ask(HttpServletRequest req, @RequestBody Map<String, Object> body) {
        var user = auth.require(req);
        String role = user.get("role").toString();
        String question = string(body, "question", 1, 500).strip().toLowerCase(Locale.ROOT);
        var products = db.rows("SELECT * FROM products ORDER BY name");
        var product = findProduct(products, question);
        String category = findCategory(products, question);
        boolean business = role.equals("BUSINESS_USER");
        Map<String, Object> result;
        if (has(question, "help", "what can you", "what can i ask", "how do you work"))
            result = answer("I answer questions using live product, review, pricing and inventory data. "
                + "Try a suggestion or ask about a product by name.", "help", null, null, "products", "reviews");
        else if (product != null) result = productAnswer(question, product, business);
        else if (has(question, "how many product", "number of product", "how many categor", "catalog size", "catalogue size"))
            result = counts();
        else if (has(question, "low stock", "low on stock", "running out", "out of stock", "restock", "inventory", "stock level"))
            result = lowStock(business);
        else if (has(question, "alert", "notification")) result = alerts();
        else if (has(question, "suspicious", "fake")) result = reviewList(null, true);
        else if (has(question, "negative", "complain", "unhappy", "angry", "bad review", "worst review")) result = reviewList(category, false);
        else if (has(question, "lowest rated", "worst rated", "worst product", "poorly rated", "lowest rating", "worst"))
            result = rank(category, true);
        else if (has(question, "top", "best", "highest rated", "highest rating", "popular", "favourite", "favorite"))
            result = rank(category, false);
        else result = answer("Ask about rated products, reviews, stock, alerts, or name a product to ask about its "
            + "sentiment, demand forecast, price or competitors.", "unknown", null, null);
        result.put("suggestions", suggestions(role));
        return result;
    }

    private Map<String, Object> productAnswer(String question, Map<String, Object> product, boolean business) {
        UUID id = (UUID) product.get("id");
        String name = product.get("name").toString();
        if (has(question, "forecast", "demand", "sell", "next week", "units")) {
            List<Map<String, Object>> days = (List<Map<String, Object>>) pricing.forecast(product).get("days");
            double total = days.stream().mapToDouble(day -> number(day, "predicted_units")).sum();
            var peak = days.stream().max(Comparator.comparingDouble(day -> number(day, "predicted_units"))).orElseThrow();
            return answer(format("The XGBoost demand model predicts about %.0f units of %s in the next 7 days at %s, "
                + "peaking on %s (%.1f units).", total, name, money(product.get("current_price")), peak.get("date"),
                number(peak, "predicted_units")), "forecast", id,
                table(List.of("Date", "Predicted units"), days.stream()
                    .map(day -> List.of(day.get("date").toString(), format("%.1f", number(day, "predicted_units")))).toList()),
                "demand model (XGBoost)", "products");
        }
        if (has(question, "competitor", "rival", "market price")) {
            if (business) return answer("Competitor pricing is available to Analysts and Admins.", "competitors_denied", id, null);
            var rows = db.rows("SELECT competitor_name,price FROM competitor_prices WHERE product_id=? ORDER BY recorded_at DESC", id);
            if (rows.isEmpty()) return answer("No competitor prices are recorded for " + name + " yet.", "competitors", id, null,
                "competitor prices");
            double average = rows.stream().mapToDouble(row -> number(row, "price")).average().orElseThrow();
            return answer(format("%d competitor price(s) recorded for %s. Their average is %s.", rows.size(), name, money(average)),
                "competitors", id, table(List.of("Competitor", "Price"), rows.stream()
                    .map(row -> List.of(row.get("competitor_name").toString(), money(row.get("price")))).toList()), "competitor prices");
        }
        if (has(question, "recommend", "should", "raise", "lower", "increase", "decrease", "optimal", "best price", "price")) {
            if (business) return answer(name + " is currently " + money(product.get("current_price"))
                + ". Model-based recommendations are available to Analysts and Admins.", "price_denied", id, null, "products");
            var rec = pricing.recommendation(product, Map.of(), true);
            var reasons = (List<String>) rec.get("reasoning");
            return answer(format("For %s, the ML pricing engine recommends %s (%+.1f%% vs base %s), "
                + "with %s confidence and about %.1f units/day expected demand.", name, money(rec.get("recommended_price")),
                number(rec, "adjustment_pct") * 100, money(rec.get("base_price")), rec.get("confidence"),
                number(rec, "predicted_demand_units")), "price_recommendation", id,
                table(List.of("Why"), reasons.stream().map(List::of).toList()),
                "demand model (XGBoost)", "SHAP", "reviews", "inventory", "competitors");
        }
        if (has(question, "stock", "inventory", "restock")) {
            if (business) return answer("Inventory data is available to Analysts and Admins.", "stock_denied", id, null);
            var stock = db.optional("SELECT " + PricingRoutes.INVENTORY + " FROM inventory WHERE product_id=?", id);
            String message = stock == null ? "No inventory record exists for " + name + " yet."
                : format("%s has %s unit(s) in stock (reorder at %s).%s", name, stock.get("stock_level"),
                    stock.get("reorder_threshold"), Boolean.TRUE.equals(stock.get("is_low_stock")) ? " It needs restocking." : "");
            return answer(message, "stock", id, null, "inventory");
        }
        var summary = pricing.summary(id);
        String head = name + " costs " + money(product.get("current_price"));
        var count = db.optional("SELECT count(*) AS count FROM reviews WHERE product_id=?", id).get("count");
        if (number(summary, "average_rating") == 0) return answer(head + ". It has no reviews yet.", "product_overview",
            id, null, "products", "reviews");
        String message = format("%s. It has %s review(s) averaging %.1f★.", head, count, number(summary, "average_rating"));
        if (number(summary, "analyzed_review_count") == 0) message += " None have finished sentiment analysis yet.";
        else {
            message += format(" Of %s analyzed, %s are positive and %s negative.", summary.get("analyzed_review_count"),
                summary.get("positive_count"), summary.get("negative_count"));
            var aspects = (List<Map<String, Object>>) summary.get("top_aspects");
            if (!aspects.isEmpty()) message += " Most-mentioned aspects include " + String.join(", ", aspects.stream()
                .limit(3).map(row -> row.get("aspect").toString()).toList()) + ".";
        }
        return answer(message, "sentiment", id, null, "products", "reviews", "aspect sentiment");
    }

    private Map<String, Object> counts() {
        var product = db.optional("SELECT count(*) AS products,count(DISTINCT category) AS categories FROM products");
        var review = db.optional(Analytics.REVIEW_COUNTS);
        return answer(format("There are %s products across %s categories, with %s reviews (%s analyzed).",
            product.get("products"), product.get("categories"), review.get("reviews_total"), review.get("reviews_analyzed")),
            "counts", null, null, "products", "reviews");
    }

    private Map<String, Object> rank(String category, boolean ascending) {
        var rows = db.rows("""
            SELECT p.id,p.name,p.category,avg(r.rating) AS rating,count(*) AS reviews FROM products p
            JOIN reviews r ON r.product_id=p.id WHERE (?::text IS NULL OR p.category=?)
            GROUP BY p.id ORDER BY rating
            """ + (ascending ? " ASC" : " DESC") + ",reviews DESC,p.name LIMIT 5", category, category);
        if (rows.isEmpty()) return answer("No reviews are available to rank products in this selection.", "rank", null, null, "reviews");
        var lead = rows.getFirst();
        return answer(format("%s-rated%s: %s has an average of %.1f★ across %s review(s).",
            ascending ? "Lowest" : "Top", category == null ? "" : " in " + category, lead.get("name"),
            number(lead, "rating"), lead.get("reviews")), "rank", lead.get("id"),
            table(List.of("Product", "Category", "Avg rating", "Reviews"), rows.stream().map(row -> List.of(
                row.get("name").toString(), row.get("category").toString(), format("%.1f ★", number(row, "rating")),
                row.get("reviews").toString())).toList()), "products", "reviews");
    }

    private Map<String, Object> reviewList(String category, boolean suspicious) {
        String intent = suspicious ? "suspicious" : "negative_reviews";
        var rows = db.rows("""
            SELECT p.name,r.rating,r.content,r.sentiment_score,r.fake_score FROM reviews r
            JOIN products p ON p.id=r.product_id WHERE (?::text IS NULL OR p.category=?) AND
            """ + (suspicious ? "r.fake_score>=0.5 ORDER BY r.fake_score DESC" : "r.sentiment_label='NEGATIVE' ORDER BY r.created_at DESC")
                + " LIMIT 5", category, category);
        if (rows.isEmpty()) return answer(suspicious ? "No reviews are currently flagged as suspicious."
            : "No reviews are classified as negative in this selection.", intent, null, null, "reviews");
        return answer(format("Here are %d %s reviews.", rows.size(), suspicious ? "flagged" : "recent negative"), intent, null,
            table(List.of("Product", "Rating", suspicious ? "Fake score" : "Model confidence", "Review"),
                rows.stream().map(row -> List.of(row.get("name").toString(), row.get("rating") + " ★",
                    format("%.0f%%", 100 * number(row, suspicious ? "fake_score" : "sentiment_score")),
                    preview(row.get("content").toString(), suspicious ? 100 : 110))).toList()), "reviews");
    }

    private Map<String, Object> lowStock(boolean business) {
        if (business) return answer("Inventory data is available to Analysts and Admins.", "low_stock_denied", null, null);
        var rows = db.rows("""
            SELECT p.id,p.name,i.stock_level,i.reorder_threshold FROM inventory i JOIN products p ON p.id=i.product_id
            WHERE i.stock_level<=i.reorder_threshold ORDER BY i.stock_level,p.name LIMIT 10
            """);
        if (rows.isEmpty()) return answer("No products are at or below their reorder threshold.", "low_stock", null, null, "inventory");
        var lead = rows.getFirst();
        return answer(format("%d product(s) are at or below their reorder threshold. %s is lowest at %s unit(s).",
            rows.size(), lead.get("name"), lead.get("stock_level")), "low_stock", lead.get("id"),
            table(List.of("Product", "Stock", "Reorder at"), rows.stream().map(row -> List.of(
                row.get("name").toString(), row.get("stock_level").toString(), row.get("reorder_threshold").toString())).toList()),
            "inventory", "products");
    }

    private Map<String, Object> alerts() {
        var rows = db.rows("""
            SELECT a.alert_type,p.name,a.severity,a.message,count(*) OVER () AS total FROM alerts a
            JOIN products p ON p.id=a.product_id WHERE NOT a.is_read ORDER BY a.created_at DESC LIMIT 6
            """);
        if (rows.isEmpty()) return answer("There are no unread alerts.", "alerts", null, null, "alerts");
        return answer(format("You have %s unread alert(s). The latest %d are below.", rows.getFirst().get("total"), rows.size()),
            "alerts", null, table(List.of("Type", "Product", "Severity", "Message"), rows.stream().map(row -> List.of(
                row.get("alert_type").toString().replace('_', ' '), row.get("name").toString(), row.get("severity").toString(),
                row.get("message").toString())).toList()), "alerts");
    }

    private Map<String, Object> findProduct(List<Map<String, Object>> rows, String question) {
        var exact = rows.stream().filter(row -> question.contains(row.get("name").toString().toLowerCase(Locale.ROOT)))
            .max(Comparator.comparingInt(row -> row.get("name").toString().length()));
        if (exact.isPresent()) return exact.get();
        var query = tokens(question);
        Map<String, Object> best = null;
        double bestScore = 0;
        for (var row : rows) {
            var name = tokens(row.get("name").toString().toLowerCase(Locale.ROOT));
            if (name.isEmpty()) continue;
            long hits = name.stream().filter(query::contains).count();
            double score = (double) hits / name.size();
            if (hits >= 2 && score >= .5 && score > bestScore) { best = row; bestScore = score; }
        }
        return best;
    }

    private String findCategory(List<Map<String, Object>> products, String question) {
        var categories = products.stream().map(row -> row.get("category").toString()).distinct().toList();
        return categories.stream().filter(category -> question.contains(category.toLowerCase(Locale.ROOT)))
            .max(Comparator.comparingInt(String::length)).orElseGet(() -> categories.stream().filter(category -> {
                String first = category.toLowerCase(Locale.ROOT).split("\\s+")[0].replaceAll("[,&]+$", "");
                return first.length() > 4 && Pattern.compile("\\b" + Pattern.quote(first) + "\\b").matcher(question).find();
            }).findFirst().orElse(null));
    }

    private Set<String> tokens(String text) {
        var result = new HashSet<>(Arrays.asList(text.split("[^a-z0-9]+")));
        result.removeIf(token -> token.length() <= 1 || STOP.contains(token));
        return result;
    }

    private boolean has(String text, String... parts) { return Arrays.stream(parts).anyMatch(text::contains); }
    private String preview(String text, int limit) { return text.length() <= limit ? text : text.substring(0, limit) + "…"; }
    private String money(Object price) { return format("$%,.2f", new BigDecimal(price.toString())); }
    private Map<String, Object> table(List<String> columns, List<List<String>> rows) { return map("columns", columns, "rows", rows); }
    private Map<String, Object> answer(String text, String intent, Object product, Object table, String... sources) {
        return map("answer", text, "intent", intent, "product_id", product, "table", table, "sources", List.of(sources));
    }
}
