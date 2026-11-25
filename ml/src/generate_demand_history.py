"""
Generates synthetic daily demand (units sold) history for every
product currently in the database, and writes it into the real
`demand_history` table via the backend's own DB session — not a
separate offline dataset file, since this needs real product IDs
and real current prices from the live database.

Methodology (documented for the report/viva): with no real
sales/checkout system in this project, historical demand is
synthesized using a standard, transparent formula rather than random
noise, so the resulting patterns are realistic enough to train a
genuinely useful forecasting model on:

  daily_units = base_demand
              * seasonality_factor(day_of_week, day_of_year)
              * price_elasticity_factor(price / product.base_price)
              * category_popularity_factor(category)
              + gaussian_noise

- seasonality: weekend uplift + a slow annual sine wave (peak in
  Nov/Dec, matching typical retail seasonality)
- price elasticity: demand falls as price rises above the product's
  base_price, and rises as price drops below it (a standard downward-
  sloping demand curve, not a flat line)
- category popularity: a fixed per-category multiplier, so
  Electronics/Fashion show more baseline volume than a niche category
  like Musical Instruments — deliberately varied so the model has to
  learn real structure, not a single global average

This script generates 180 days of history per product (~6 months),
run from the repo root:
    cd ml && python -m src.generate_demand_history
"""
import math
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

from app.db.session import SessionLocal  # noqa: E402
from app.models import user, product, review, competitor_price, inventory, demand_history  # noqa: E402,F401
from app.models.demand_history import DemandHistory  # noqa: E402
from app.models.product import Product  # noqa: E402

random.seed(42)  # reproducible synthetic data

CATEGORY_POPULARITY = {
    "Electronics": 1.4,
    "Fashion & Apparel": 1.3,
    "Beauty & Makeup": 1.3,
    "Home & Kitchen": 1.1,
    "Groceries & Gourmet": 1.5,
    "Sports & Fitness": 1.0,
    "Books & Stationery": 0.8,
    "Toys & Games": 1.1,
    "Furniture": 0.5,
    "Automotive": 0.6,
    "Mobile Accessories": 1.6,
    "Health & Wellness": 1.0,
    "Jewelry & Watches": 0.4,
    "Pet Supplies": 0.9,
    "Baby & Kids": 0.8,
    "Office Supplies": 0.7,
    "Garden & Outdoor": 0.6,
    "Musical Instruments": 0.3,
    "Luggage & Travel Gear": 0.5,
    "Video Games & Consoles": 1.2,
}
DEFAULT_POPULARITY = 0.8


def seasonality_factor(d: date) -> float:
    weekend_uplift = 1.25 if d.weekday() >= 5 else 1.0
    day_of_year = d.timetuple().tm_yday
    annual_wave = 1.0 + 0.3 * math.sin(2 * math.pi * (day_of_year - 305) / 365)
    return weekend_uplift * annual_wave


def price_elasticity_factor(price: Decimal, base_price: Decimal) -> float:
    if base_price == 0:
        return 1.0
    ratio = float(price) / float(base_price)
    # Demand drops ~1.5% for every 1% price increase above base,
    # rises symmetrically below base — a simple constant-elasticity model.
    return max(0.1, 1.0 - 1.5 * (ratio - 1.0))


def generate_for_product(db, product: Product, days: int = 180) -> int:
    popularity = CATEGORY_POPULARITY.get(product.category, DEFAULT_POPULARITY)
    base_demand = 8.0 * popularity

    today = date.today()
    rows_created = 0
    for offset in range(days, 0, -1):
        d = today - timedelta(days=offset)
        # Simulate mild price drift over time, hovering near current_price.
        price_noise = Decimal(str(round(random.uniform(-0.05, 0.05), 2)))
        price_at_time = max(
            Decimal("1.00"), product.current_price * (Decimal("1.0") + price_noise)
        )

        expected = (
            base_demand
            * seasonality_factor(d)
            * price_elasticity_factor(price_at_time, product.base_price)
        )
        units = max(0, round(random.gauss(expected, max(1.0, expected * 0.2))))

        db.add(
            DemandHistory(
                product_id=product.id,
                record_date=d,
                units_sold=units,
                price_at_time=price_at_time.quantize(Decimal("0.01")),
            )
        )
        rows_created += 1

    return rows_created


def main():
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        if not products:
            print("No products found — import/create products before generating demand history.")
            return

        total = 0
        for product in products:
            total += generate_for_product(db, product)
        db.commit()
        print(f"Generated {total} demand history rows across {len(products)} products.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
