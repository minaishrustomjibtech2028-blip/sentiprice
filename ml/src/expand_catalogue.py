"""
Expand every project category to TARGET products using the Amazon 2023 dataset.

    python -m src.expand_catalogue --data-dir /path/with/csvs --dry-run
    python -m src.expand_catalogue --data-dir /path/with/csvs

Rules (see docs/catalogue-expansion.md):
  * existing products are never modified or deleted
  * a category only receives products until it reaches TARGET (default 50)
  * each added product is one dataset record: its own title, price, list
    price, ASIN, product URL and its own imgUrl (the image is hot-linked, so
    no image bytes are stored or invented)
  * only Amazon categories that match the project category are used
  * ASIN-derived names already in the DB are skipped, so re-runs are safe
  * no inventory or competitor rows are fabricated; the app treats them as optional
"""
import argparse
import sys
from decimal import Decimal
from pathlib import Path

import pandas as pd
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.competitor_price import CompetitorPrice  # noqa: F401  (mapper registry)
from app.models.inventory import Inventory  # noqa: F401
from app.models.product import Product
from app.models.review import Review  # noqa: F401
from app.models.user import User  # noqa: F401

TARGET = 50
NAME_MAX = 255

# Project category -> Amazon dataset category_name values (closest matches only).
# Groceries & Gourmet, Musical Instruments, Garden & Outdoor and Books & Stationery have no
# suitable Amazon category (or the only candidates were off-topic) and are intentionally absent.
CATEGORY_MAP: dict[str, list[str]] = {
    "Electronics": ["Computers & Tablets", "Computer Monitors", "Televisions & Video Products", "Headphones & Earbuds", "Camera & Photo", "Wearable Technology", "Computer Components", "Laptop Accessories", "Home Audio & Theater Products", "GPS & Navigation"],
    "Fashion & Apparel": ["Men's Clothing", "Women's Clothing", "Men's Shoes", "Women's Shoes", "Men's Accessories", "Women's Accessories"],
    "Beauty & Makeup": ["Makeup", "Skin Care Products", "Hair Care Products", "Perfumes & Fragrances", "Beauty Tools & Accessories", "Foot, Hand & Nail Care Products"],
    "Home & Kitchen": ["Kitchen & Dining", "Bedding", "Home Décor Products", "Bath Products", "Home Storage & Organization"],
    "Sports & Fitness": ["Sports & Fitness", "Sports & Outdoors", "Outdoor Recreation", "Sports Nutrition Products"],
    "Toys & Games": ["Toys & Games", "Building Toys", "Learning & Education Toys", "Puzzles", "Stuffed Animals & Plush Toys", "Games & Accessories", "Toy Figures & Playsets"],
    "Furniture": ["Furniture", "Kids' Furniture"],
    "Automotive": ["Automotive Tools & Equipment", "Automotive Replacement Parts", "Car Care", "Oils & Fluids", "Automotive Tires & Wheels", "Automotive Interior Accessories", "Automotive Exterior Accessories", "Car Electronics & Accessories", "Lights, Bulbs & Indicators", "Automotive Performance Parts & Accessories"],
    "Mobile Accessories": ["Cell Phones & Accessories", "Tablet Accessories"],
    "Health & Wellness": ["Health Care Products", "Wellness & Relaxation Products", "Oral Care Products", "Health & Household"],
    "Jewelry & Watches": ["Women's Jewelry", "Men's Watches", "Women's Watches", "Girls' Jewelry", "Girls' Watches", "Boys' Watches", "Boys' Jewelry"],
    "Pet Supplies": ["Dog Supplies", "Cat Supplies", "Pet Bird Supplies", "Fish & Aquatic Pets", "Small Animal Supplies", "Reptiles & Amphibian Supplies", "Horse Supplies"],
    "Baby & Kids": ["Baby Diapering Products", "Baby & Toddler Feeding Supplies", "Baby Care Products", "Baby Girls' Clothing & Shoes", "Baby Boys' Clothing & Shoes", "Baby Strollers & Accessories", "Baby Travel Gear"],
    "Office Supplies": ["Office Electronics", "Packaging & Shipping Supplies"],
    "Luggage & Travel Gear": ["Luggage", "Suitcases", "Luggage Sets", "Backpacks", "Travel Duffel Bags", "Travel Accessories", "Messenger Bags", "Travel Tote Bags", "Laptop Bags", "Garment Bags", "Rain Umbrellas"],
    "Video Games & Consoles": ["Video Games", "Video Game Consoles & Accessories", "Nintendo Switch Consoles, Games & Accessories", "PlayStation 5 Consoles, Games & Accessories", "Xbox Series X & S Consoles, Games & Accessories", "PC Games & Accessories"],
}


def load_candidates(data_dir: Path) -> pd.DataFrame:
    cats = pd.read_csv(data_dir / "amazon_categories.csv")
    prods = pd.read_csv(
        data_dir / "amazon_products.csv",
        usecols=["asin", "title", "imgUrl", "productURL", "stars", "reviews",
                 "price", "listPrice", "category_id", "isBestSeller", "boughtInLastMonth"],
    )
    df = prods.merge(cats, left_on="category_id", right_on="id")
    ok = (
        df["title"].notna()
        & df["imgUrl"].fillna("").str.startswith("https://")
        & (df["price"] > 0)
        & df["asin"].notna()
    )
    df = df[ok].copy()
    # Within a project category, prefer what sells and is reviewed; stable tie-break on ASIN.
    df = df.sort_values(
        ["boughtInLastMonth", "reviews", "stars", "asin"],
        ascending=[False, False, False, True],
    )
    df = df.drop_duplicates(subset=["asin"])
    return df


def pick_for_category(df: pd.DataFrame, amazon_cats: list[str], needed: int, used_titles: set[str]) -> pd.DataFrame:
    pool = df[df["category_name"].isin(amazon_cats)]
    rows, seen = [], set()
    for _, r in pool.iterrows():
        key = " ".join(str(r["title"]).lower().split())
        if key in used_titles or key in seen:
            continue
        seen.add(key)
        rows.append(r)
        if len(rows) == needed:
            break
    return pd.DataFrame(rows)


def build_description(r: pd.Series) -> str:
    lines = [
        f"ASIN: {r['asin']}",
        f"Amazon category: {r['category_name']}",
        f"Rating: {r['stars']:.1f} from {int(r['reviews']):,} reviews",
        f"Bought in last month: {int(r['boughtInLastMonth']):,}",
        f"Product page: {r['productURL']}",
    ]
    if bool(r["isBestSeller"]):
        lines.insert(0, "Amazon Best Seller")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--target", type=int, default=TARGET)
    args = ap.parse_args()

    df = load_candidates(args.data_dir)
    db = SessionLocal()
    total_added = 0
    report = []
    try:
        existing_names = {n.lower().strip() for (n,) in db.execute(select(Product.name))}
        for project_cat, amazon_cats in CATEGORY_MAP.items():
            have = db.scalar(select(func.count(Product.id)).where(Product.category == project_cat)) or 0
            needed = max(0, args.target - have)
            if needed == 0:
                report.append((project_cat, have, 0, 0))
                continue
            picked = pick_for_category(df, amazon_cats, needed, existing_names)
            added = 0
            for _, r in picked.iterrows():
                name = " ".join(str(r["title"]).split())[:NAME_MAX]
                key = name.lower()
                if key in existing_names:
                    continue
                existing_names.add(key)
                list_price = float(r["listPrice"])
                price = Decimal(str(r["price"])).quantize(Decimal("0.01"))
                base = Decimal(str(list_price)).quantize(Decimal("0.01")) if list_price > float(r["price"]) else price
                if not args.dry_run:
                    db.add(Product(
                        name=name, category=project_cat, description=build_description(r),
                        image_url=r["imgUrl"], base_price=base, current_price=price,
                    ))
                added += 1
            if not args.dry_run:
                db.commit()
            total_added += added
            report.append((project_cat, have, added, have + added))
    finally:
        db.close()

    print(f"{'Category':28s} {'before':>6s} {'added':>6s} {'after':>6s}")
    for c, before, added, after in report:
        print(f"{c:28s} {before:6d} {added:6d} {after:6d}")
    print(f"Total added: {total_added}{' (dry run, nothing written)' if args.dry_run else ''}")


if __name__ == "__main__":
    sys.exit(main())
