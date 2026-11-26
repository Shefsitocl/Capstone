from pathlib import Path
import json
from fastapi import FastAPI
import pandas as pd
from xgboost import XGBClassifier

BASE = Path(__file__).resolve().parent
app = FastAPI()

modelo = XGBClassifier()
modelo.load_model(BASE / "modelo_xgb_nsp_zero.json")
meta = json.loads((BASE / "meta_nsp_zero.json").read_text(encoding="utf-8"))
cols_modelo, umbral = meta["feature_columns"], meta["threshold"]

@app.post("/api/ml/recalculate")
def recalculate(body: dict):
    df = pd.DataFrame(body["citas"])
    ids = df.pop("cita_id")
    X = pd.get_dummies(df).reindex(columns=cols_modelo, fill_value=0).astype(float)
    probs = modelo.predict_proba(X)[:, 1]
    return {"predicciones": [
        {"cita_id": i, "probabilidad_nsp": float(p), "nivel_riesgo": "ALTO" if p >= umbral else "BAJO"}
        for i, p in zip(ids, probs)]}
