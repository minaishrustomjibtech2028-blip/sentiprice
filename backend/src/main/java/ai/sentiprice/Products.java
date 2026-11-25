package ai.sentiprice;

import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.apache.commons.csv.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import static ai.sentiprice.Data.*;

@RestController
@RequestMapping("/api/v1/products")
class Products {
    static final String[] CSV_COLUMNS = {"name", "category", "description", "base_price", "current_price", "image_url"};
    static final String WITH_STATS = """
        SELECT p.*, r.review_count, r.average_rating FROM products p
        CROSS JOIN LATERAL (SELECT count(*) AS review_count, avg(rating) AS average_rating
        FROM reviews WHERE product_id=p.id) r
        """;
    final Data db;
    final Auth auth;

    Products(Data db, Auth auth) { this.db = db; this.auth = auth; }

    Map<String, Object> product(UUID id) {
        return db.required("Product not found.", "SELECT * FROM products WHERE id=?", id);
    }

    @GetMapping
    Object list(HttpServletRequest req, @RequestParam(required = false) String category,
                @RequestParam(required = false) String search) {
        auth.require(req);
        StringBuilder sql = new StringBuilder(WITH_STATS + " WHERE true");
        List<Object> args = new ArrayList<>();
        if (category != null && !category.isEmpty()) {
            sql.append(" AND p.category=?");
            args.add(category);
        }
        if (search != null && !search.isEmpty()) {
            sql.append(" AND p.name ILIKE ?");
            args.add("%" + search + "%");
        }
        return db.rows(sql + " ORDER BY p.category,p.name", args.toArray()).stream().map(Data::decimalStrings).toList();
    }

    @GetMapping("/categories")
    Object categories(HttpServletRequest req) {
        auth.require(req);
        return db.rows("SELECT DISTINCT category FROM products ORDER BY category").stream()
            .map(row -> row.get("category")).toList();
    }

    @GetMapping("/{id}")
    Object detail(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req);
        return decimalStrings(db.required("Product not found.", WITH_STATS + " WHERE p.id=?", id));
    }

    Map<String, Object> insert(Map<String, ?> body, String image) {
        return decimalStrings(db.optional("""
            INSERT INTO products(id,name,category,description,base_price,current_price,image_url,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,now(),now()) RETURNING *
            """, UUID.randomUUID(), string(body, "name", 1, 255), string(body, "category", 1, 100),
            body.get("description") == null ? null : string(body, "description", 0, Integer.MAX_VALUE),
            price(body, "base_price"), price(body, "current_price"), image));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Object create(HttpServletRequest req, @RequestBody Map<String, Object> body) {
        auth.require(req, "ADMIN");
        return insert(body, null);
    }

    @PatchMapping("/{id}")
    Object patch(HttpServletRequest req, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
        auth.require(req, "ADMIN");
        List<String> changes = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (String key : List.of("name", "category", "description", "base_price", "current_price")) {
            if (!body.containsKey(key)) continue;
            Object value = body.get(key);
            if (value == null && !key.equals("description")) continue;
            changes.add(key + "=?");
            args.add(switch (key) {
                case "name" -> string(body, key, 1, 255);
                case "category" -> string(body, key, 1, 100);
                case "description" -> value == null ? null : string(body, key, 0, Integer.MAX_VALUE);
                default -> price(body, key);
            });
        }
        if (changes.isEmpty()) return decimalStrings(product(id));
        args.add(id);
        return decimalStrings(db.required("Product not found.", "UPDATE products SET "
            + String.join(",", changes) + ",updated_at=now() WHERE id=? RETURNING *", args.toArray()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN");
        var old = db.required("Product not found.", "DELETE FROM products WHERE id=? RETURNING image_url", id);
        deleteLocalImage(old.get("image_url"));
    }

    @GetMapping(value = "/export", produces = "text/csv")
    ResponseEntity<String> export(HttpServletRequest req) throws IOException {
        auth.require(req, "ADMIN");
        StringWriter output = new StringWriter();
        try (var csv = new CSVPrinter(output, CSVFormat.DEFAULT.builder().setHeader(CSV_COLUMNS).get())) {
            for (var row : db.rows("SELECT * FROM products ORDER BY category,name"))
                csv.printRecord(Arrays.stream(CSV_COLUMNS).map(row::get).toList());
        }
        return ResponseEntity.ok().header("Content-Disposition", "attachment; filename=products_export.csv")
            .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8)).body(output.toString());
    }

    @PostMapping("/import")
    Object importCsv(HttpServletRequest req, @RequestParam MultipartFile file) throws IOException {
        auth.require(req, "ADMIN");
        if (file.getOriginalFilename() == null || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".csv"))
            throw error(400, "File must be a .csv");
        String contents = new String(file.getBytes(), StandardCharsets.UTF_8).replaceFirst("^\uFEFF", "");
        var format = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).get();
        int created = 0;
        List<String> errors = new ArrayList<>();
        try (var csv = format.parse(new StringReader(contents))) {
            for (String column : List.of("name", "category", "base_price", "current_price"))
                if (!csv.getHeaderMap().containsKey(column)) throw error(400, "CSV missing required column: " + column);
            for (var record : csv) {
                try {
                    var values = record.toMap();
                    values.replaceAll((key, value) -> value == null ? null : value.strip());
                    if ("".equals(values.get("description"))) values.put("description", null);
                    String image = values.getOrDefault("image_url", "");
                    insert(values, image != null && (image.startsWith("https://") || image.startsWith("http://"))
                        ? image.substring(0, Math.min(image.length(), 500)) : null);
                    created++;
                } catch (org.springframework.web.server.ResponseStatusException | org.springframework.dao.DataAccessException e) {
                    errors.add("Row " + (record.getRecordNumber() + 1) + ": " +
                        (e instanceof org.springframework.web.server.ResponseStatusException status
                            ? status.getReason() : "Could not save product."));
                }
            }
        } catch (UncheckedIOException e) {
            throw error(400, "Invalid CSV data.");
        }
        return map("created", created, "skipped", errors.size(), "errors", errors);
    }

    @PostMapping("/{id}/image")
    Object image(HttpServletRequest req, @PathVariable UUID id, @RequestParam MultipartFile file) throws IOException {
        auth.require(req, "ADMIN");
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw error(400, "Image must be between 1 byte and 5 MB.");
        byte[] bytes = file.getBytes();
        String extension = imageExtension(bytes);
        String filename = UUID.randomUUID() + "." + extension;
        Path path = App.UPLOAD.resolve("products").resolve(filename);
        Files.write(path, bytes, StandardOpenOption.CREATE_NEW);
        try {
            return updateImage(id, "/media/products/" + filename);
        } catch (RuntimeException e) {
            Files.deleteIfExists(path);
            throw e;
        }
    }

    @DeleteMapping("/{id}/image")
    Object removeImage(HttpServletRequest req, @PathVariable UUID id) {
        auth.require(req, "ADMIN");
        return updateImage(id, null);
    }

    Map<String, Object> updateImage(UUID id, String url) {
        var result = new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.datasource.DataSourceTransactionManager(db.jdbc.getDataSource())).execute(status -> {
                var old = db.required("Product not found.", "SELECT image_url FROM products WHERE id=? FOR UPDATE", id);
                var changed = db.optional("UPDATE products SET image_url=?, updated_at=now() WHERE id=? RETURNING *", url, id);
                return map("old", old.get("image_url"), "new", changed);
            });
        deleteLocalImage(result.get("old"));
        return decimalStrings((Map<String, Object>) result.get("new"));
    }

    static void deleteLocalImage(Object url) {
        if (!(url instanceof String value) || !value.matches("/media/products/[a-zA-Z0-9_-]+\\.(png|jpg|jpeg|webp|gif)")) return;
        try {
            Files.deleteIfExists(App.UPLOAD.resolve(value.substring("/media/".length())));
        } catch (IOException e) {
            org.slf4j.LoggerFactory.getLogger(Products.class).warn("Could not remove product image", e);
        }
    }

    static String imageExtension(byte[] bytes) {
        if (bytes.length >= 12) {
            String signature = new String(bytes, 0, 12, StandardCharsets.ISO_8859_1);
            if (signature.startsWith("\u0089PNG\r\n\u001a\n")) return "png";
            if (signature.startsWith("\u00ff\u00d8\u00ff")) return "jpg";
            if (signature.startsWith("GIF87a") || signature.startsWith("GIF89a")) return "gif";
            if (signature.startsWith("RIFF") && signature.substring(8).equals("WEBP")) return "webp";
        }
        throw error(400, "Unsupported image type. Use JPEG, PNG, GIF, or WebP.");
    }
}
