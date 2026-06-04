"""
train_model.py — Run this once to regenerate models/ if needed.
The pre-trained models are already included in models/.
"""
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from imblearn.over_sampling import SMOTE
import joblib
import os
import warnings
warnings.filterwarnings('ignore')

os.makedirs('models', exist_ok=True)
os.makedirs('data', exist_ok=True)

# ── Generate synthetic dataset ────────────────────────────────────────────────
np.random.seed(42)
n = 7000

data = {
    'customerID':          [f'CUST_{i:05d}' for i in range(n)],
    'tenure':              np.random.randint(0, 73, n),
    'MonthlyCharges':      np.random.uniform(18, 120, n),
    'TotalCharges':        np.random.uniform(18, 8500, n),
    'Contract':            np.random.choice(['Month-to-month', 'One year', 'Two year'], n),
    'InternetService':     np.random.choice(['DSL', 'Fiber optic', 'No'], n),
    'OnlineSecurity':      np.random.choice(['Yes', 'No', 'No internet service'], n),
    'TechSupport':         np.random.choice(['Yes', 'No', 'No internet service'], n),
    'StreamingTV':         np.random.choice(['Yes', 'No', 'No internet service'], n),
    'StreamingMovies':     np.random.choice(['Yes', 'No', 'No internet service'], n),
    'MonthlyServiceCalls': np.random.randint(0, 20, n),
    'City':                np.random.choice(['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune'], n),
    'PlanType':            np.random.choice(['Basic', 'Standard', 'Premium'], n),
}

df = pd.DataFrame(data)
churn_prob = (
    (df['tenure'] < 12).astype(int)             * 0.30 +
    (df['Contract'] == 'Month-to-month').astype(int) * 0.30 +
    (df['TechSupport'] == 'No').astype(int)      * 0.20 +
    (df['MonthlyCharges'] > 80).astype(int)      * 0.20
)
df['Churn'] = (churn_prob > np.random.random(n)).astype(int)
df.to_csv('data/churn_data.csv', index=False)
print(f"Dataset: {len(df)} rows, {df['Churn'].sum()} churned ({df['Churn'].mean()*100:.1f}%)")

# ── Preprocess ────────────────────────────────────────────────────────────────
df['TotalCharges'] = pd.to_numeric(df['TotalCharges'], errors='coerce')
df = df.dropna()
X = df.drop(['customerID', 'Churn'], axis=1)
y = df['Churn']

le_dict = {}
for col in X.select_dtypes(include='object').columns:
    le = LabelEncoder()
    X[col] = le.fit_transform(X[col])
    le_dict[col] = le

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

smote = SMOTE(random_state=42, k_neighbors=5)
X_train_sm, y_train_sm = smote.fit_resample(X_train, y_train)

scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train_sm)
X_test_sc  = scaler.transform(X_test)

# ── Train models ──────────────────────────────────────────────────────────────
models = {
    'Logistic Regression': LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42),
    'Random Forest':       RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42, n_jobs=-1),
    'XGBoost':             XGBClassifier(n_estimators=100, random_state=42, eval_metric='logloss'),
}

best_model, best_f1 = None, 0
results = {}

for name, clf in models.items():
    if name == 'Logistic Regression':
        clf.fit(X_train_sc, y_train_sm)
        y_pred      = clf.predict(X_test_sc)
        y_pred_prob = clf.predict_proba(X_test_sc)[:, 1]
    else:
        clf.fit(X_train_sm, y_train_sm)
        y_pred      = clf.predict(X_test)
        y_pred_prob = clf.predict_proba(X_test)[:, 1]

    f1  = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_prob)
    results[name] = {'f1': round(f1,4), 'roc_auc': round(auc,4)}
    print(f"{name}: F1={f1:.4f}, AUC={auc:.4f}")

    if f1 > best_f1:
        best_f1, best_model = f1, (name, clf)

# ── Save ─────────────────────────────────────────────────────────────────────
best_name, best_clf = best_model
print(f"\nBest: {best_name} (F1={best_f1:.4f})")
joblib.dump(best_clf, 'models/best_model.pkl')
joblib.dump(scaler if best_name == 'Logistic Regression' else None, 'models/scaler.pkl')
joblib.dump(le_dict,       'models/label_encoders.pkl')
joblib.dump(X.columns.tolist(), 'models/feature_names.pkl')

if hasattr(best_clf, 'feature_importances_'):
    fi = pd.DataFrame({'feature': X.columns, 'importance': best_clf.feature_importances_})
    fi = fi.sort_values('importance', ascending=False)
    fi.to_csv('models/feature_importance.csv', index=False)
    print(fi.head(5).to_string(index=False))

print("\n✓ All models saved.")
