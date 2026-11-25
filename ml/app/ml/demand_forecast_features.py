"""
Feature engineering for demand forecasting.

Canonical implementation inside the backend app package, same
train/serve-consistency reasoning as app/ml/fake_review_features.py:
the offline training script imports this exact module rather than
duplicating the logic.

Features combine date-based seasonality signals (day-of-week,
day-of-year via sin/cos so the model sees a continuous annual cycle
rather than an arbitrary 1-365 integer), price relative to the
product's base price (elasticity), and a one-hot encoded category —
category matters a lot here (Groceries vs. Musical Instruments differ
by 5x in baseline volume in this project's data), so leaving it out
would force the model to learn a single global average and badly
underfit both ends of that range.
"""
import math
from datetime import date
from decimal import Decimal

# Fixed category list (the 20 categories agreed for this project) plus
# an "other" bucket, so the feature vector has a stable, known width
# regardless of what categories exist in the DB at training vs. serving time.
KNOWN_CATEGORIES = [
    "Electronics",
    "Fashion & Apparel",
    "Beauty & Makeup",
    "Home & Kitchen",
    "Groceries & Gourmet",
    "Sports & Fitness",
    "Books & Stationery",
    "Toys & Games",
    "Furniture",
    "Automotive",
    "Mobile Accessories",
    "Health & Wellness",
    "Jewelry & Watches",
    "Pet Supplies",
    "Baby & Kids",
    "Office Supplies",
    "Garden & Outdoor",
    "Musical Instruments",
    "Luggage & Travel Gear",
    "Video Games & Consoles",
]

BASE_FEATURES = [
    "day_of_week",
    "is_weekend",
    "day_of_year_sin",
    "day_of_year_cos",
    "price_ratio_to_base",
]
FEATURE_ORDER = BASE_FEATURES + [f"category_{c}" for c in KNOWN_CATEGORIES] + ["category_other"]


def extract_features(
    record_date: date, price_at_time: Decimal, base_price: Decimal, category: str
) -> dict[str, float]:
    day_of_year = record_date.timetuple().tm_yday
    base = float(base_price) if base_price else 1.0
    price_ratio = float(price_at_time) / base if base else 1.0

    features = {
        "day_of_week": float(record_date.weekday()),
        "is_weekend": 1.0 if record_date.weekday() >= 5 else 0.0,
        "day_of_year_sin": math.sin(2 * math.pi * day_of_year / 365),
        "day_of_year_cos": math.cos(2 * math.pi * day_of_year / 365),
        "price_ratio_to_base": price_ratio,
    }
    for c in KNOWN_CATEGORIES:
        features[f"category_{c}"] = 1.0 if category == c else 0.0
    features["category_other"] = 1.0 if category not in KNOWN_CATEGORIES else 0.0

    return features


def features_to_vector(features: dict[str, float]) -> list[float]:
    return [features[k] for k in FEATURE_ORDER]
