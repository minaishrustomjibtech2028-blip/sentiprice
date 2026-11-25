package ai.sentiprice;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(0)
class AdminBootstrap implements ApplicationRunner {
    private static final String OLD_DEMO_PASSWORD = "Demo@1234";
    private final Auth auth;

    AdminBootstrap(Auth auth) { this.auth = auth; }

    static String email() {
        return System.getenv().getOrDefault("ADMIN_EMAIL", "admin@sentiprice.ai").strip().toLowerCase(Locale.ROOT);
    }

    static final String DEMO_ADMIN = "admin@sentiprice.ai";
    static final String DEMO_ANALYST = "analyst@sentiprice.ai";

    static boolean presentationEnabled() {
        return Boolean.parseBoolean(System.getenv("PRESENTATION_ACCOUNTS"));
    }

    static boolean reserved(String email) {
        return email.equals(email()) || email.equals(DEMO_ADMIN) || email.equals(DEMO_ANALYST);
    }

    private void setupPresentationAccount(String email, String role, String name) {
        var existing = auth.db.optional("SELECT id,role::text,hashed_password FROM users WHERE email=? FOR UPDATE", email);
        if (existing == null) {
            auth.db.update("""
                INSERT INTO users(id,email,hashed_password,full_name,role,is_active,created_at)
                VALUES (?,?,?,?,?::role_enum,true,now()) ON CONFLICT (email) DO NOTHING
                """, UUID.randomUUID(), email, auth.bcrypt.encode(OLD_DEMO_PASSWORD), name, role);
        } else if (role.equals(existing.get("role"))
            && auth.bcrypt.matches(OLD_DEMO_PASSWORD, existing.get("hashed_password").toString())) {
            auth.db.update("UPDATE users SET is_active=true WHERE id=?", existing.get("id"));
        }
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String email = auth.email(Map.of("email", email()));
        String password = System.getenv().getOrDefault("ADMIN_PASSWORD", "");
        if (!password.isEmpty() && (password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72
            || password.equals(OLD_DEMO_PASSWORD))) {
            throw new IllegalStateException("ADMIN_PASSWORD must be at least 12 characters and at most 72 UTF-8 bytes.");
        }

        auth.db.optional("SELECT pg_advisory_xact_lock(1835435182)");
        if (!password.isEmpty()) {
            var existing = auth.db.optional("SELECT id,role::text,hashed_password FROM users WHERE email=? FOR UPDATE", email);
            if (existing == null) {
                auth.db.update("""
                    INSERT INTO users(id,email,hashed_password,full_name,role,is_active,created_at)
                    VALUES (?,?,?,'SentiPrice Admin','ADMIN',true,now())
                    """, UUID.randomUUID(), email, auth.bcrypt.encode(password));
            } else if (!"ADMIN".equals(existing.get("role"))) {
                throw new IllegalStateException("ADMIN_EMAIL belongs to an existing non-admin account. Choose a different email.");
            } else if (auth.bcrypt.matches(OLD_DEMO_PASSWORD, existing.get("hashed_password").toString())) {
                auth.db.update("UPDATE users SET hashed_password=?,is_active=true WHERE id=?",
                    auth.bcrypt.encode(password), existing.get("id"));
            }
        }

        boolean presentation = presentationEnabled();
        if (presentation) {
            setupPresentationAccount(DEMO_ADMIN, "ADMIN", "SentiPrice Admin");
            setupPresentationAccount(DEMO_ANALYST, "ANALYST", "SentiPrice Analyst");
        }

        for (var user : auth.db.rows("""
            SELECT id,email,role::text,hashed_password FROM users WHERE is_active
              AND email IN ('admin@sentiprice.ai','analyst@sentiprice.ai','business@sentiprice.ai')
            """)) {
            if (presentation && ((DEMO_ADMIN.equals(user.get("email")) && "ADMIN".equals(user.get("role")))
                || (DEMO_ANALYST.equals(user.get("email")) && "ANALYST".equals(user.get("role"))))) continue;
            if (auth.bcrypt.matches(OLD_DEMO_PASSWORD, user.get("hashed_password").toString())) {
                auth.db.update("UPDATE users SET is_active=false WHERE id=?", user.get("id"));
            }
        }
    }
}
