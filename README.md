# ChurnLens — Customer Churn Prediction Platform

A full-stack ML web application for predicting and analysing customer churn,
built with **Flask + Scikit-learn + XGBoost + Chart.js**.

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the app  (models & data are already included)
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## Project Structure

```
ChurnLens/
├── app.py                  ← Flask backend (API routes)
├── train_model.py          ← Re-train models from scratch (optional)
├── requirements.txt
├── data/
│   └── churn_data.csv      ← 7,000 synthetic Indian telecom customers
├── models/
│   ├── best_model.pkl      ← Trained Random Forest (best F1)
│   ├── scaler.pkl          ← StandardScaler (used for Logistic Regression path)
│   ├── label_encoders.pkl  ← LabelEncoders for all categorical features
│   ├── feature_names.pkl   ← Ordered feature list for inference
│   └── feature_importance.csv
├── templates/
│   └── index.html          ← Jinja2 template (all 4 views)
└── static/
    ├── style.css
    └── script.js           ← API calls + Chart.js visualisations
```

---

## API Endpoints

| Method | Route            | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | `/`              | Renders the dashboard UI                 |
| GET    | `/api/metrics`   | KPI counts from the real CSV             |
| GET    | `/api/charts`    | Chart data (tenure, city, plan, contract)|
| GET    | `/api/customers` | Top 20 at-risk customers with risk score |
| POST   | `/api/predict`   | Real-time churn prediction from the model|
| GET    | `/api/model-info`| Feature importance from saved model      |

### Predict payload example

```json
POST /api/predict
{
  "tenure": 5,
  "monthly_charge": 899,
  "support_calls": 8,
  "contract": "Month-to-month",
  "internet_service": "Fiber optic",
  "online_security": "No",
  "streaming_tv": "No",
  "streaming_movies": "No",
  "city": "Mumbai",
  "plan_type": "Basic"
}
```

### Predict response example

```json
{
  "churn_probability": 83.4,
  "will_churn": true,
  "status": "At Risk",
  "risk_level": "high",
  "factors": [
    {"name": "Month-to-month contract", "weight": 0.88},
    {"name": "Low tenure (5 months)", "weight": 0.79}
  ],
  "recommendations": [
    "Escalate to retention team immediately",
    "Offer a 2-month billing credit as a win-back"
  ]
}
```

---

## ML Pipeline

| Step | Detail |
|------|--------|
| Data | 7,000 synthetic Indian telecom customers |
| Features | tenure, MonthlyCharges, TotalCharges, Contract, InternetService, OnlineSecurity, TechSupport, StreamingTV, StreamingMovies, MonthlyServiceCalls, City, PlanType |
| Balancing | SMOTE (Synthetic Minority Oversampling) |
| Models trained | Logistic Regression, Random Forest, XGBoost |
| Selection | Best F1-Score saved as `best_model.pkl` |
| Top predictor | Contract type (37% importance) |

---

## Re-training

If you want to regenerate models from scratch:

```bash
python train_model.py
```

This overwrites `data/churn_data.csv` and all files in `models/`.
