# ==============================================================================
# KURA · PIPELINE DE IA PREDICTIVA (XGBOOST EN GOOGLE COLAB)
# Entrena el modelo XGBoost con variables APS y envía la versión/pesos al API.
# ==============================================================================
import json
import urllib.request
import numpy as np
import pandas as pd

try:
    from xgboost import XGBClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score
except ImportError:
    print("En Google Colab ejecuta primero: !pip install xgboost scikit-learn pandas numpy")
    raise

np.random.seed(42)
n_samples = 1500
df = pd.DataFrame({
    "age": np.random.randint(18, 88, n_samples),
    "distance_km": np.round(np.random.uniform(0.5, 7.5, n_samples), 1),
    "nsp_ratio": np.round(np.random.beta(2, 6, n_samples), 2),
    "preferential_law": np.random.binomial(1, 0.35, n_samples),
    "confirmed_t24": np.random.binomial(1, 0.65, n_samples),
})

logit = (
    -1.65
    + 3.40 * df["nsp_ratio"]
    + 0.24 * np.maximum(0, df["distance_km"] - 1.0)
    - 1.45 * df["confirmed_t24"]
    - 0.20 * df["preferential_law"]
)
prob = 1 / (1 + np.exp(-logit))
df["nsp_target"] = np.random.binomial(1, prob)

X = df[["age", "distance_km", "nsp_ratio", "preferential_law", "confirmed_t24"]]
y = df["nsp_target"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = XGBClassifier(n_estimators=120, max_depth=4, learning_rate=0.08, eval_metric="logloss")
model.fit(X_train, y_train)

auc = roc_auc_score(y_test, model.predict_proba(X_test)[:, 1])
print(f"Modelo XGBoost Kura entrenado · ROC-AUC en validación: {auc:.3f}")

API_URL = "http://localhost:5000/api/ml/recalculate"

if __name__ == "__main__":
    req = urllib.request.Request(
        API_URL,
        data=json.dumps({"modelVersion": f"XGBoost-Kura-AUC-{auc:.3f}"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            print("Respuesta API Kura:", resp.read().decode("utf-8"))
    except Exception as err:
        print(f"No se pudo conectar a {API_URL}: {err}")
