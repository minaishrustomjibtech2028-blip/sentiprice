"""Export the fitted booster and training metadata used by the Java backend."""
import json


def export_java_model(repo_root, name, model, features, metrics):
    learner = json.loads(model.get_booster().save_raw(raw_format="json"))["learner"]
    destination = repo_root / "backend/src/main/resources/models" / f"{name}.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(
        {"learner": learner, "features": features, "metrics": metrics},
        separators=(",", ":"),
    ), encoding="utf-8")
    print(f"Exported Java model to {destination}")
