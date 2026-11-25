package ai.sentiprice;

import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import javax.sql.DataSource;
import org.apache.commons.csv.CSVFormat;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

final class Catalogue {
    private static final String VERSION = "amazon-2023-v1";

    private Catalogue() {}

    static UUID productId(String name) {
        return UUID.nameUUIDFromBytes((VERSION + ":" + name.toLowerCase(Locale.ROOT)).getBytes(StandardCharsets.UTF_8));
    }

    static void initialize(DataSource source) throws Exception {
        try (var input = new ClassPathResource("amazon-catalogue.csv").getInputStream();
             var reader = new InputStreamReader(input, StandardCharsets.UTF_8);
             var csv = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).get().parse(reader)) {
            var rows = csv.getRecords();
            var db = new JdbcTemplate(source);
            new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(status -> {
                int claimed = db.update("""
                    INSERT INTO catalogue_imports(version) VALUES (?) ON CONFLICT DO NOTHING
                    """, VERSION);
                if (claimed == 0) return;
                // Keep an already imported legacy catalogue intact.
                Boolean legacy = db.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM products WHERE description ~ '(^|[[:space:]])ASIN: [A-Z0-9]{10}')
                    """, Boolean.class);
                if (Boolean.TRUE.equals(legacy)) return;
                db.batchUpdate("""
                    INSERT INTO products(id,name,category,description,base_price,current_price,image_url,created_at,updated_at)
                    SELECT ?,?,?,?,?,?,?,now(),now() WHERE NOT EXISTS (
                      SELECT 1 FROM products WHERE lower(name)=lower(?)
                    ) ON CONFLICT (id) DO NOTHING
                    """, rows, 200, (statement, row) -> {
                        String name = row.get("name");
                        statement.setObject(1, productId(name));
                        statement.setString(2, name);
                        statement.setString(3, row.get("category"));
                        statement.setString(4, row.get("description"));
                        statement.setBigDecimal(5, new BigDecimal(row.get("base_price")));
                        statement.setBigDecimal(6, new BigDecimal(row.get("current_price")));
                        String image = row.get("image_url");
                        statement.setString(7, image.isEmpty() ? null : image);
                        statement.setString(8, name);
                    });
            });
        }
    }
}
