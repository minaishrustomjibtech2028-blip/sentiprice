package ai.sentiprice;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import static ai.sentiprice.Data.*;

@Component
@ConditionalOnProperty(name = "seed-demo", havingValue = "true")
class Demo implements ApplicationRunner {
    final Data db;
    final Auth auth;
    final Products products;
    final ReviewAnalysis analysis;
    final ObjectMapper json;
    final TransactionTemplate transaction;

    Demo(Data db, Auth auth, Products products, ReviewAnalysis analysis, ObjectMapper json, TransactionTemplate transaction) {
        this.db = db; this.auth = auth; this.products = products; this.analysis = analysis;
        this.json = json; this.transaction = transaction;
    }

    @Override public void run(ApplicationArguments args) throws Exception {
        try (var file = new ClassPathResource("demo.json").getInputStream()) {
            var seed = json.readTree(file);
            boolean withReviews = args.containsOption("with-reviews");
            Map<String, Object> reviewer = null;
            if (withReviews) {
                db.update("""
                    INSERT INTO users(id,email,hashed_password,full_name,role,is_active,created_at)
                    VALUES (?,?,?,'Sample Reviewer','BUSINESS_USER',false,now())
                    ON CONFLICT (id) DO NOTHING
                    """, UUID.fromString("8f8fa8d4-75c8-4d68-a957-e990b752ee1d"),
                    UUID.randomUUID() + "@example.invalid", auth.bcrypt.encode(UUID.randomUUID().toString()));
                reviewer = db.optional("SELECT id,full_name FROM users WHERE id=?",
                    UUID.fromString("8f8fa8d4-75c8-4d68-a957-e990b752ee1d"));
            }
            Random random = new Random(42);
            int index = 0;
            for (var entry : seed.path("products")) {
                String name = entry.get(0).asText(), category = entry.get(1).asText();
                BigDecimal base = new BigDecimal(entry.get(2).asText());
                List<String> lines = new ArrayList<>();
                entry.get(4).forEach(line -> lines.add(line.asText()));
                UUID id = transaction.execute(status -> {
                    db.optional("SELECT pg_advisory_xact_lock(1835435181)");
                    var existing = db.optional("SELECT id FROM products WHERE name=?", name);
                    UUID newProduct;
                    if (existing == null) {
                        newProduct = (UUID) products.insert(map("name", name, "category", category,
                            "description", String.join("\n", lines), "base_price", base, "current_price", entry.get(3).asText()), null).get("id");
                    } else {
                        newProduct = (UUID) existing.get("id");
                        if (!newProduct.equals(Catalogue.productId(name))
                            || db.optional("SELECT id FROM inventory WHERE product_id=?", newProduct) != null
                            || db.optional("SELECT id FROM competitor_prices WHERE product_id=? LIMIT 1", newProduct) != null)
                            return newProduct;
                    }
                    int threshold = 10 + random.nextInt(4) * 5;
                    boolean low = random.nextDouble() < .15;
                    int stock = low ? random.nextInt(threshold + 1) : random.nextInt(threshold + 15, 221);
                    db.update("INSERT INTO inventory VALUES (gen_random_uuid(),?,?,?,now())", newProduct, stock, threshold);
                    if (low) db.update("""
                        INSERT INTO alerts(id,product_id,alert_type,message,severity,is_read,created_at)
                        VALUES (gen_random_uuid(),?,'low_stock',?,?,false,now())
                        """, newProduct, "Stock (" + stock + ") is at or below the reorder threshold (" + threshold + ").",
                        stock == 0 ? "critical" : "warning");
                    var rivals = new ArrayList<>(List.of("RivalMart", "ShopSphere", "BargainBay", "PrimeCart"));
                    Collections.shuffle(rivals, random);
                    for (String rival : rivals.subList(0, 2 + random.nextInt(2))) {
                        BigDecimal price = base.multiply(BigDecimal.valueOf(random.nextInt(930, 1101), 3))
                            .setScale(2, RoundingMode.HALF_UP);
                        db.update("INSERT INTO competitor_prices VALUES (gen_random_uuid(),?,?,?,now())", newProduct, rival, price);
                    }
                    return newProduct;
                });
                if (withReviews && db.optional("SELECT id FROM reviews WHERE product_id=? LIMIT 1", id) == null) {
                    var pool = seed.path("review_pool");
                    for (int k = 0; k < 3; k++) {
                        var sample = pool.get((index * 3 + k * 7) % pool.size());
                        UUID review = UUID.randomUUID();
                        db.update("""
                            INSERT INTO reviews(id,product_id,user_id,reviewer_display_name,content,rating,created_at)
                            VALUES (?,?,?,?,?,?,now())
                            """, review, id, reviewer.get("id"), reviewer.get("full_name"), sample.get(1).asText(), sample.get(0).asInt());
                        analysis.analyze(review);
                    }
                }
                index++;
            }
            System.out.println("Demo data ready.");
        }
    }
}
