package ai.sentiprice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.DependsOn;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Component
@DependsOn("initializeSchema")
class Data {
    final JdbcTemplate jdbc;

    Data(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    List<Map<String, Object>> rows(String sql, Object... args) {
        return jdbc.queryForList(sql, args);
    }

    Map<String, Object> optional(String sql, Object... args) {
        return rows(sql, args).stream().findFirst().orElse(null);
    }

    Map<String, Object> required(String message, String sql, Object... args) {
        var result = optional(sql, args);
        if (result == null) throw error(404, message);
        return result;
    }

    int update(String sql, Object... args) { return jdbc.update(sql, args); }

    static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }

    static ResponseStatusException error(int status, String detail) {
        return new ResponseStatusException(HttpStatus.valueOf(status), detail);
    }

    static String string(Map<String, ?> body, String key, int min, int max) {
        if (!(body.get(key) instanceof String value) || value.length() < min || value.length() > max)
            throw error(422, "Invalid " + key + ".");
        return value;
    }

    static BigDecimal price(Map<String, ?> body, String key) {
        try {
            var value = new BigDecimal(String.valueOf(body.get(key))).setScale(2, RoundingMode.HALF_UP);
            if (value.signum() <= 0 || value.precision() > 10) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException e) {
            throw error(422, "Invalid " + key + ".");
        }
    }

    static int integer(Map<String, ?> body, String key, int min, int max) {
        try {
            int value = new BigDecimal(String.valueOf(body.get(key))).intValueExact();
            if (value < min || value > max) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException | ArithmeticException e) {
            throw error(422, "Invalid " + key + ".");
        }
    }

    static double number(Map<String, ?> row, String key) {
        return row.get(key) instanceof Number n ? n.doubleValue() : 0;
    }

    static Map<String, Object> decimalStrings(Map<String, Object> row) {
        for (String key : List.of("base_price", "current_price", "price")) {
            if (row.get(key) instanceof BigDecimal value) row.put(key, value.toPlainString());
        }
        return row;
    }
}
