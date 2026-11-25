# Catalogue expansion (Amazon 2023 dataset)

The Java backend includes a catalogue snapshot derived from
[Asaniczka's Amazon Products Dataset 2023 (1.4M Products)](https://www.kaggle.com/datasets/asaniczka/amazon-products-dataset-2023-1-4m-products),
version 17, published under the [Open Data Commons Attribution License](https://opendatacommons.org/licenses/by/1-0/).
The snapshot filters and ranks the source records using the project's category
mapping and adds 768 listings to the 40 demo products, for 808 products in total.
The source product image URLs are stored as URLs.

## Optional expansion with a local dataset

Expands every project category that has a matching Amazon category to 50 products.

Run from `ml/` with the offline requirements installed and PostgreSQL running.

    python -m src.expand_catalogue --data-dir /path/to/dataset --dry-run
    python -m src.expand_catalogue --data-dir /path/to/dataset

`--data-dir` must contain `amazon_products.csv` and `amazon_categories.csv`
from the Kaggle dataset "Amazon Products Dataset 2023 (1.4M Products)".

## Behaviour
- Existing products are never modified or deleted.
- A category receives only as many products as needed to reach 50.
- Re-running is safe: products whose names already exist are skipped.
- Added products keep their dataset values: title, current price (`price`),
  list price (`listPrice`, stored as base price when higher), ASIN, product URL,
  rating, review count and Amazon category, written into the description.
- `image_url` stores the dataset's own `imgUrl`. The frontend already passes
  absolute http(s) URLs through, so the image is loaded from Amazon's CDN.
- No inventory or competitor rows are created; the app treats them as optional.

## Categories not expanded
Groceries & Gourmet, Musical Instruments, Garden & Outdoor and Books & Stationery
have no suitable Amazon category in the dataset, so they keep their 2 products.
