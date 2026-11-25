package ai.sentiprice;

import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer;
import ai.onnxruntime.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
class Transformers {
    static final String SENTIMENT = "distilbert/distilbert-base-uncased-finetuned-sst-2-english";
    static final String EMOTION = "j-hartmann/emotion-english-distilroberta-base";
    private static final String SENTIMENT_TOKENIZER = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";
    private static final String EMOTION_ONNX = "onnx-community/emotion-english-distilroberta-base-ONNX";
    static final String HUB = "https://huggingface.co/";
    final Path cache = Path.of(System.getenv().getOrDefault("NLP_CACHE", "model-cache"));
    private volatile Classifier sentiment;
    private volatile Classifier emotion;
    private final Object sentimentLock = new Object();
    private final Object emotionLock = new Object();

    record Prediction(String label, double confidence) {}
    record Classifier(HuggingFaceTokenizer tokenizer, OrtSession session, List<String> labels) {}

    Prediction sentiment(String text) throws Exception { return classify(get(false), text); }
    Prediction emotion(String text) throws Exception { return classify(get(true), text); }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void warmSentiment() { warm(false); }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void warmEmotion() { warm(true); }

    private void warm(boolean isEmotion) {
        try {
            get(isEmotion);
        } catch (Exception | LinkageError e) {
            LoggerFactory.getLogger(Transformers.class).warn("Could not preload the {} model",
                isEmotion ? "emotion" : "sentiment", e);
        }
    }

    private Classifier get(boolean isEmotion) throws Exception {
        Classifier cached = isEmotion ? emotion : sentiment;
        if (cached != null) return cached;
        synchronized (isEmotion ? emotionLock : sentimentLock) {
            cached = isEmotion ? emotion : sentiment;
            if (cached != null) return cached;
            String name = isEmotion ? "emotion" : "sentiment";
            Path directory = cache.resolve(name);
            Files.createDirectories(directory);
            String modelRepo = isEmotion ? EMOTION_ONNX : SENTIMENT_TOKENIZER;
            String tokenizerRepo = isEmotion ? EMOTION : SENTIMENT_TOKENIZER;
            Path tokenizerPath = download(directory, "tokenizer.json", tokenizerRepo, "tokenizer.json");
            Path modelPath = directory.resolve("model.onnx");
            if (!Files.isRegularFile(modelPath)) {
                modelPath = download(directory, "model_quantized.onnx", modelRepo, "onnx/model_quantized.onnx");
            }
            var tokenizer = HuggingFaceTokenizer.newInstance(tokenizerPath, Map.of(
                "truncation", "true", "maxLength", "512", "padding", "false"));
            try (var options = new OrtSession.SessionOptions()) {
                options.setIntraOpNumThreads(2);
                options.setInterOpNumThreads(1);
                var session = OrtEnvironment.getEnvironment().createSession(modelPath.toString(), options);
                cached = new Classifier(tokenizer, session, isEmotion
                    ? List.of("anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise")
                    : List.of("NEGATIVE", "POSITIVE"));
            } catch (OrtException e) {
                tokenizer.close();
                throw e;
            }
            if (isEmotion) emotion = cached;
            else sentiment = cached;
            return cached;
        }
    }

    private Path download(Path directory, String name, String repo, String file) throws Exception {
        Path destination = directory.resolve(name);
        if (Files.isRegularFile(destination)) return destination;
        Path temp = Files.createTempFile(directory, name, ".part");
        Process process = null;
        try {
            String url = HUB + repo + "/resolve/main/" + file;
            process = new ProcessBuilder("curl", "-fLsS", "--connect-timeout", "15",
                "--max-time", "90", "--speed-limit", "1024", "--speed-time", "20", "--output", temp.toString(), url).redirectError(ProcessBuilder.Redirect.INHERIT).start();
            if (!process.waitFor(95, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IOException("Model download timed out for " + repo);
            }
            if (process.exitValue() != 0) throw new IOException("Model download failed for " + repo + " (" + name + ")");
            return Files.move(temp, destination, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
            Files.deleteIfExists(temp);
        }
    }

    private Prediction classify(Classifier classifier, String text) throws OrtException {
        var encoding = classifier.tokenizer.encode(text);
        var ort = OrtEnvironment.getEnvironment();
        try (var tokens = OnnxTensor.createTensor(ort, new long[][] {encoding.getIds()});
             var mask = OnnxTensor.createTensor(ort, new long[][] {encoding.getAttentionMask()});
             var types = OnnxTensor.createTensor(ort, new long[][] {encoding.getTypeIds()})) {
            Map<String, OnnxTensor> inputs = new HashMap<>();
            inputs.put("input_ids", tokens);
            if (classifier.session.getInputNames().contains("attention_mask")) inputs.put("attention_mask", mask);
            if (classifier.session.getInputNames().contains("token_type_ids")) inputs.put("token_type_ids", types);
            try (var result = classifier.session.run(inputs)) {
                float[] logits = ((float[][]) result.get(0).getValue())[0];
                int best = 0;
                for (int i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
                double sum = 0;
                for (float logit : logits) sum += Math.exp(logit - logits[best]);
                return new Prediction(classifier.labels.get(best), 1 / sum);
            }
        }
    }
}
