"""
Trains the demand-forecasting XGBoost regressor on the real
`demand_history` table (populated by generate_demand_history.py) and
saves the artifact to ml/artifacts/demand_forecast_model.joblib.

Run from the repo root (after generate_demand_history.py has been run
at least once):
    cd ml && python -m src.train_demand_forecast_model

Uses a time-based train/test split (train on the earlier ~80% of
days, test on the most recent ~20%) rather than a random split —
random splitting would leak future information into training for a
time-series problem, which would make the evaluation metrics
meaningless.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

import joblib
from src.export_java_model import export_java_model
import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score
from xgboost import XGBRegressor

from app.db.session import SessionLocal
from app.models import user, product, review, competitor_price, inventory, demand_history  # noqa: F401
from app.models.demand_history import DemandHistory
from app.models.product import Product
from app.ml.demand_forecast_features import FEATURE_ORDER, extract_features, features_to_vector

ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "demand_forecast_model.joblib"


def main():
    db = SessionLocal()
    try:
        rows = (
            db.query(DemandHistory, Product.category, Product.base_price)
            .join(Product, Product.id == DemandHistory.product_id)
            .order_by(DemandHistory.record_date)
            .all()
        )
    finally:
        db.close()

    if len(rows) < 50:
        print(
            f"Only {len(rows)} demand_history rows found — run "
            "`python -m src.generate_demand_history` first."
        )
        return

    X, y, dates = [], [], []
    for demand_row, category, base_price in rows:
        feats = extract_features(
            demand_row.record_date, demand_row.price_at_time, base_price, category
        )
        X.append(features_to_vector(feats))
        y.append(demand_row.units_sold)
        dates.append(demand_row.record_date)

    X = np.array(X)
    y = np.array(y)

    # Time-based split: earliest 80% of rows (by date) train, most recent 20% test.
    order = np.argsort(dates)
    X, y = X[order], y[order]
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    model = XGBRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.08,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print(f"Test MAE: {mae:.2f} units/day")
    print(f"Test R²: {r2:.3f}")

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_order": FEATURE_ORDER,
            "test_mae": mae,
            "test_r2": r2,
            "trained_on_rows": len(rows),
        },
        ARTIFACT_PATH,
    )
    export_java_model(REPO_ROOT, ARTIFACT_PATH.stem, model, FEATURE_ORDER, {"test_mae": float(mae), "test_r2": float(r2), "trained_on_rows": len(rows)})
    print(f"Saved model artifact to {ARTIFACT_PATH}")


if __name__ == "__main__":
    main()
