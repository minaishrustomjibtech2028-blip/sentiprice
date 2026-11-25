"""
Feature engineering for fake/suspicious review detection.

This is the CANONICAL implementation, living inside the backend app
package (not the ml/ folder) so the running FastAPI service never
depends on files outside its own Docker build context. The offline
training script (ml/src/train_fake_review_model.py) imports this
exact module — by adding backend/ to its path — so training and
serving are always guaranteed to compute features identically.

These features are deliberately interpretable (not learned embeddings):
length, punctuation intensity, generic-superlative density, and
rating/text-sentiment mismatch are all things a human reviewer could
sanity-check, which matters for an explainable-AI project.
"""
import re

GENERIC_PHRASES = [
    "best product ever",
    "highly recommend",
    "five stars",
    "changed my life",
    "amazing amazing",
    "must buy",
    "perfect in every way",
    "exceeded all expectations",
    "worth every penny",
    "10 out of 10",
]

SUPERLATIVES = [
    "best",
    "perfect",
    "amazing",
    "incredible",
    "flawless",
    "life-changing",
    "greatest",
    "outstanding",
    "phenomenal",
]


def extract_features(content: str, rating: int) -> dict[str, float]:
    text = content.strip()
    lower = text.lower()
    words = lower.split()
    word_count = max(len(words), 1)

    exclamation_count = text.count("!")
    caps_words = sum(1 for w in text.split() if len(w) > 1 and w.isupper())

    generic_hits = sum(1 for phrase in GENERIC_PHRASES if phrase in lower)
    superlative_hits = sum(1 for w in SUPERLATIVES if w in lower)

    # Very short reviews paired with extreme ratings (1 or 5) are a
    # classic low-effort-fake-review signature.
    is_extreme_rating = 1.0 if rating in (1, 5) else 0.0
    is_very_short = 1.0 if word_count < 6 else 0.0

    unique_word_ratio = len(set(words)) / word_count

    return {
        "word_count": float(word_count),
        "exclamation_ratio": exclamation_count / word_count,
        "caps_word_ratio": caps_words / word_count,
        "generic_phrase_count": float(generic_hits),
        "superlative_density": superlative_hits / word_count,
        "is_extreme_rating": is_extreme_rating,
        "is_very_short": is_very_short,
        "unique_word_ratio": unique_word_ratio,
        "rating": float(rating),
    }


FEATURE_ORDER = [
    "word_count",
    "exclamation_ratio",
    "caps_word_ratio",
    "generic_phrase_count",
    "superlative_density",
    "is_extreme_rating",
    "is_very_short",
    "unique_word_ratio",
    "rating",
]


def features_to_vector(features: dict[str, float]) -> list[float]:
    return [features[k] for k in FEATURE_ORDER]
