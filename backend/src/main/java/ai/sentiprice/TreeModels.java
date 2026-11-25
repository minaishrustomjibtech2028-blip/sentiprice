package ai.sentiprice;

import com.fasterxml.jackson.databind.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import static ai.sentiprice.Data.map;

@Component
class TreeModels {
    final Model demand;
    final Model fake;

    TreeModels(ObjectMapper json) throws IOException {
        demand = load(json, "demand_forecast_model");
        fake = load(json, "fake_review_model");
    }

    private Model load(ObjectMapper json, String filename) throws IOException {
        try (var input = new ClassPathResource("models/" + filename + ".json").getInputStream()) {
            var bundle = json.readTree(input);
            var learner = bundle.path("learner");
            List<Tree> trees = new ArrayList<>();
            learner.path("gradient_booster").path("model").path("trees").forEach(t -> trees.add(new Tree(
                ints(t.path("left_children")), ints(t.path("right_children")), ints(t.path("split_indices")),
                floats(t.path("split_conditions")), floats(t.path("sum_hessian")))));
            List<String> features = new ArrayList<>();
            bundle.path("features").forEach(f -> features.add(f.asText()));
            float base = Float.parseFloat(learner.path("learner_model_param").path("base_score").asText());
            boolean logistic = learner.path("objective").path("name").asText().equals("binary:logistic");
            if (logistic) base = (float) -Math.log(1.0 / base - 1);
            Map<String, Object> metrics = new LinkedHashMap<>();
            bundle.path("metrics").fields().forEachRemaining(entry -> metrics.put(entry.getKey(),
                entry.getValue().isIntegralNumber() ? entry.getValue().intValue() : rounded(entry.getValue().asDouble(), 4)));
            return new Model(base, logistic, features, trees, metrics);
        }
    }

    static int[] ints(JsonNode values) {
        int[] result = new int[values.size()];
        for (int i = 0; i < result.length; i++) result[i] = values.get(i).asInt();
        return result;
    }

    static float[] floats(JsonNode values) {
        float[] result = new float[values.size()];
        for (int i = 0; i < result.length; i++) result[i] = values.get(i).floatValue();
        return result;
    }

    static double rounded(double value, int places) {
        double scale = Math.pow(10, places);
        return Math.rint(value * scale) / scale;
    }

    record Model(float base, boolean logistic, List<String> features, List<Tree> trees, Map<String, Object> metrics) {
        double predict(float[] vector) {
            float sum = base;
            for (Tree tree : trees) sum += tree.predict(vector);
            return logistic ? 1 / (1 + Math.exp(-sum)) : sum;
        }
    }

    record Tree(int[] left, int[] right, int[] split, float[] value, float[] cover) {
        float predict(float[] vector) {
            int i = 0;
            while (left[i] >= 0) i = vector[split[i]] < value[i] ? left[i] : right[i];
            return value[i];
        }

        double expected(int i, int known, int[] bits, float[] vector) {
            if (left[i] < 0) return value[i];
            int feature = split[i];
            if ((known & bits[feature]) != 0)
                return expected(vector[feature] < value[i] ? left[i] : right[i], known, bits, vector);
            return (cover[left[i]] * expected(left[i], known, bits, vector)
                + cover[right[i]] * expected(right[i], known, bits, vector)) / cover[i];
        }

        // Exact path-dependent Shapley values. Features absent from a tree have
        // zero contribution, so only the features that tree actually splits on
        // need to be included in its coalition calculation.
        void contribute(float[] vector, double[] contributions) {
            int[] bits = new int[vector.length];
            int width = 0;
            for (int i = 0; i < split.length; i++) {
                if (left[i] >= 0 && bits[split[i]] == 0) bits[split[i]] = 1 << width++;
            }
            if (width == 0) return;
            double[] values = new double[1 << width];
            for (int mask = 0; mask < values.length; mask++) values[mask] = expected(0, mask, bits, vector);
            double[] weights = new double[width];
            weights[0] = 1.0 / width;
            for (int i = 1; i < width; i++) weights[i] = weights[i - 1] * i / (width - i);
            for (int i = 0; i < bits.length; i++) {
                int bit = bits[i];
                if (bit == 0) continue;
                for (int mask = 0; mask < values.length; mask++) {
                    if ((mask & bit) == 0) contributions[i] += weights[Integer.bitCount(mask)]
                        * (values[mask | bit] - values[mask]);
                }
            }
        }
    }

    float[] demandFeatures(LocalDate date, double price, double base, String category) {
        float[] vector = new float[demand.features.size()];
        int weekday = date.getDayOfWeek().getValue() - 1;
        double angle = 2 * Math.PI * date.getDayOfYear() / 365;
        vector[0] = weekday;
        vector[1] = weekday >= 5 ? 1 : 0;
        vector[2] = (float) Math.sin(angle);
        vector[3] = (float) Math.cos(angle);
        vector[4] = (float) (price / (base == 0 ? 1 : base));
        int index = demand.features.indexOf("category_" + category);
        vector[index >= 5 ? index : vector.length - 1] = 1;
        return vector;
    }

    double predictDemand(LocalDate date, double price, double base, String category) {
        return Math.max(0, demand.predict(demandFeatures(date, price, base, category)));
    }

    static final List<String> DISPLAY = List.of("Day of week", "Weekend", "Seasonality (annual cycle)",
        "Seasonality (annual cycle)", "Price vs. base price");

    List<Map<String, Object>> explain(LocalDate date, double price, double base, String category) {
        var vector = demandFeatures(date, price, base, category);
        double[] contributions = new double[vector.length];
        for (Tree tree : demand.trees) tree.contribute(vector, contributions);
        Map<String, Double> display = new LinkedHashMap<>();
        for (int i = 0; i < contributions.length; i++)
            display.merge(i < DISPLAY.size() ? DISPLAY.get(i) : "Category", contributions[i], Double::sum);
        return display.entrySet().stream()
            .sorted(Comparator.comparingDouble((Map.Entry<String, Double> entry) -> Math.abs(entry.getValue())).reversed())
            .map(entry -> map("feature", entry.getKey(), "contribution", rounded(entry.getValue(), 3))).toList();
    }

    private static final List<String> GENERIC = List.of("best product ever", "highly recommend", "five stars",
        "changed my life", "amazing amazing", "must buy", "perfect in every way", "exceeded all expectations",
        "worth every penny", "10 out of 10");
    private static final List<String> SUPERLATIVES = List.of("best", "perfect", "amazing", "incredible",
        "flawless", "life-changing", "greatest", "outstanding", "phenomenal");

    double fakeScore(String content, int rating) {
        String text = content.strip();
        String lower = text.toLowerCase(Locale.ROOT);
        String[] words = text.isEmpty() ? new String[0] : text.split("(?U)\\s+");
        float count = Math.max(words.length, 1);
        long caps = Arrays.stream(words).filter(w -> w.length() > 1
            && w.equals(w.toUpperCase(Locale.ROOT)) && !w.equals(w.toLowerCase(Locale.ROOT))).count();
        return fake.predict(new float[] { count, text.chars().filter(c -> c == '!').count() / count,
            caps / count, GENERIC.stream().filter(lower::contains).count(),
            SUPERLATIVES.stream().filter(lower::contains).count() / count, rating == 1 || rating == 5 ? 1 : 0,
            count < 6 ? 1 : 0, Arrays.stream(words).map(w -> w.toLowerCase(Locale.ROOT)).distinct().count() / count, rating });
    }
}
