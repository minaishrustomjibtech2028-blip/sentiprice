package ai.sentiprice;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import static ai.sentiprice.Data.*;

@Component
class Auth {
    static final String USERS = "id,email,full_name,role::text AS role,is_active,created_at";
    static final List<String> ROLES = List.of("ADMIN", "ANALYST", "BUSINESS_USER");
    final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();
    final Data db;
    final Algorithm algorithm = Algorithm.HMAC256(System.getenv().getOrDefault(
        "JWT_SECRET_KEY", "dev-secret-change-in-production"));

    Auth(Data db) { this.db = db; }

    String token(Map<String, Object> user, String type, long seconds) {
        Instant now = Instant.now();
        return JWT.create().withSubject(user.get("id").toString()).withClaim("role", user.get("role").toString())
            .withClaim("type", type).withIssuedAt(now).withExpiresAt(now.plusSeconds(seconds)).sign(algorithm);
    }

    Map<String, Object> authenticate(String token, String type) {
        UUID id;
        try {
            id = UUID.fromString(JWT.require(algorithm).withClaim("type", type).withClaimPresence("exp")
                .build().verify(token).getSubject());
        } catch (RuntimeException e) {
            throw error(401, "Invalid or expired " + type + " token.");
        }
        var user = db.optional("SELECT " + USERS + " FROM users WHERE id=?", id);
        if (user == null) throw error(401, "User not found.");
        if (!Boolean.TRUE.equals(user.get("is_active"))) throw error(403, "This account is deactivated.");
        return user;
    }

    Map<String, Object> require(HttpServletRequest request, String... roles) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) throw error(401, "Not authenticated");
        var user = authenticate(header.substring(7), "access");
        if (roles.length > 0 && !List.of(roles).contains(user.get("role"))) throw error(403, "Insufficient permissions.");
        return user;
    }

    String email(Map<String, Object> body) {
        String value = string(body, "email", 3, 255).strip().toLowerCase(Locale.ROOT);
        if (!value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw error(422, "Invalid email.");
        return value;
    }

    String role(Map<String, Object> body) {
        String value = string(body, "role", 1, 20);
        if (!ROLES.contains(value)) throw error(422, "Invalid role.");
        return value;
    }
}

@RestController
@RequestMapping("/api/v1/auth")
class AuthRoutes {
    final Auth auth;
    AuthRoutes(Auth auth) { this.auth = auth; }

    @PostMapping("/register")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    Object register(@RequestBody Map<String, Object> body) {
        if (body.get("role") != null && !"BUSINESS_USER".equals(body.get("role"))) {
            throw error(403, "Public registration is for Business User accounts.");
        }
        String email = auth.email(body);
        if (AdminBootstrap.reserved(email)) throw error(409, "This email is reserved for a staff account.");
        String password = string(body, "password", 8, 72);
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw error(422, "Password is too long.");
        try {
            return auth.db.optional("""
                INSERT INTO users(id,email,hashed_password,full_name,role,is_active,created_at)
                VALUES (?,?,?,?,'BUSINESS_USER',true,now()) RETURNING
                """ + Auth.USERS, UUID.randomUUID(), email, auth.bcrypt.encode(password),
                string(body, "full_name", 1, 255));
        } catch (DuplicateKeyException e) {
            throw error(409, "A user with this email already exists.");
        }
    }

    @PostMapping("/login")
    Object login(@RequestBody Map<String, Object> body) {
        var user = auth.db.optional("SELECT " + Auth.USERS + ",hashed_password FROM users WHERE email=?", auth.email(body));
        String password = string(body, "password", 1, 255);
        if (user == null || !auth.bcrypt.matches(password, user.remove("hashed_password").toString()))
            throw error(401, "Incorrect email or password.");
        if (!Boolean.TRUE.equals(user.get("is_active"))) throw error(403, "This account is deactivated.");
        return map("access_token", access(user), "refresh_token", auth.token(user, "refresh",
            86400 * Long.parseLong(System.getenv().getOrDefault("REFRESH_TOKEN_EXPIRE_DAYS", "7"))),
            "token_type", "bearer", "user", user);
    }

    @PostMapping("/refresh")
    Object refresh(@RequestBody Map<String, Object> body) {
        try {
            return map("access_token", access(auth.authenticate(string(body, "refresh_token", 1, 8192), "refresh")),
                "token_type", "bearer");
        } catch (org.springframework.web.server.ResponseStatusException e) {
            if (e.getStatusCode().value() == 422) throw e;
            throw error(401, "Invalid or expired refresh token.");
        }
    }

    @GetMapping("/me")
    Object me(HttpServletRequest request) { return auth.require(request); }

    String access(Map<String, Object> user) {
        return auth.token(user, "access", 60 * Long.parseLong(System.getenv().getOrDefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")));
    }
}
