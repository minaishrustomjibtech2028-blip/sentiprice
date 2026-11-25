package ai.sentiprice;

import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.web.servlet.config.annotation.*;

@SpringBootApplication(exclude = org.springframework.boot.autoconfigure.sql.init.SqlInitializationAutoConfiguration.class)
@EnableAsync
public class App implements WebMvcConfigurer {
    static final Path UPLOAD = Path.of(System.getenv().getOrDefault("UPLOAD_DIR", "uploads")).toAbsolutePath();

    public static void main(String[] args) {
        var context = SpringApplication.run(App.class, args);
        if (context.getEnvironment().getProperty("seed-demo", Boolean.class, false)) context.close();
    }

    @Bean
    String initializeSchema(DataSource source) throws Exception {
        try (var conn = source.getConnection(); var statement = conn.createStatement()) {
            statement.execute("""
                DO $$ BEGIN
                  CREATE TYPE role_enum AS ENUM ('ADMIN', 'ANALYST', 'BUSINESS_USER');
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
                """);
        }
        new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(source);
        Catalogue.initialize(source);
        java.nio.file.Files.createDirectories(UPLOAD.resolve("products"));
        return "initialized";
    }

    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedOrigins(System.getenv().getOrDefault(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","))
            .allowedMethods("*").allowedHeaders("*").allowCredentials(true);
    }

    @Override public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/media/**").addResourceLocations(UPLOAD.toUri().toString().replaceFirst("/?$", "/"));
    }
}
