"""
Trains the fake/suspicious-review XGBoost classifier and saves the
artifact to ml/artifacts/fake_review_model.joblib.

Run from the repo root:
    cd ml && python -m src.train_fake_review_model

Feature engineering is imported from ml/app/ml/fake_review_features.py
(the canonical copy the running FastAPI service also uses) rather than
duplicated here, so training and serving can never silently drift apart.
This is intentionally a small, fast, CPU-only training job (no GPU,
no internet required) so it can run as part of setting up the project,
not as a one-off notebook experiment nobody can reproduce.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "ml"))

import joblib
from src.export_java_model import export_java_model
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from data.fake_review_training_data import build_labeled_dataset
from app.ml.fake_review_features import FEATURE_ORDER, extract_features, features_to_vector

ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "fake_review_model.joblib"


def main():
    texts, ratings, labels = build_labeled_dataset()
    X = np.array([features_to_vector(extract_features(t, r)) for t, r in zip(texts, ratings)])
    y = np.array(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model = XGBClassifier(
        n_estimators=100,
        max_depth=3,
        learning_rate=0.1,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_proba)
    report = classification_report(y_test, y_pred, target_names=["genuine", "suspicious"])

    print(f"Test accuracy: {accuracy:.3f}")
    print(f"Test ROC-AUC: {auc:.3f}")
    print(report)

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_order": FEATURE_ORDER,
            "test_accuracy": accuracy,
            "test_auc": auc,
        },
        ARTIFACT_PATH,
    )
    export_java_model(REPO_ROOT, ARTIFACT_PATH.stem, model, FEATURE_ORDER, {"test_accuracy": float(accuracy), "test_auc": float(auc)})
    print(f"Saved model artifact to {ARTIFACT_PATH}")


if __name__ == "__main__":
    main()
