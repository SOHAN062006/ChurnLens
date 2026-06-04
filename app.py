from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import joblib
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)


# ── Load models ──────────────────────────────────────────────────────────────
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    best_model    = joblib.load(os.path.join(BASE_DIR, 'models/best_model.pkl'))
    scaler        = joblib.load(os.path.join(BASE_DIR, 'models/scaler.pkl'))
    le_dict       = joblib.load(os.path.join(BASE_DIR, 'models/label_encoders.pkl'))
    feature_names = joblib.load(os.path.join(BASE_DIR, 'models/feature_names.pkl'))
    print("✓ Models loaded successfully!")
    print(f"  Features: {feature_names}")
except Exception as e:
    print(f"✗ Error loading models: {e}")
    best_model = scaler = le_dict = feature_names = None

# ── Load data ─────────────────────────────────────────────────────────────────
df = pd.read_csv(os.path.join(BASE_DIR, 'data/churn_data.csv'))
df['TotalCharges'] = pd.to_numeric(df['TotalCharges'], errors='coerce')
df = df.dropna()
print(f"✓ Data loaded: {len(df)} rows")

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/metrics')
def get_metrics():
    total     = int(len(df))
    churned   = int((df['Churn'] == 1).sum())
    active    = total - churned
    rate      = round((churned / total) * 100, 2)
    avg_charge = round(df['MonthlyCharges'].mean(), 2)
    return jsonify({
        'total_customers': total,
        'active_customers': active,
        'potential_churn': churned,
        'churn_rate': rate,
        'avg_monthly_charge': avg_charge
    })


@app.route('/api/charts')
def get_charts():
    # ── Tenure-grouped churn trend ────────────────────────────────────────────
    bins   = [0, 6, 12, 24, 36, 48, 60, 73]
    labels = ['0–6mo', '6–12mo', '12–24mo', '24–36mo', '36–48mo', '48–60mo', '60+mo']
    df['TenureGroup'] = pd.cut(df['tenure'], bins=bins, labels=labels, include_lowest=True)
    tg = df.groupby('TenureGroup', observed=True)['Churn'].agg(['sum', 'count'])
    tg['churn_rate'] = (tg['sum'] / tg['count'] * 100).round(1)

    # ── City churn ────────────────────────────────────────────────────────────
    cg = df.groupby('City')['Churn'].agg(['sum', 'count'])
    cg['churn_rate'] = (cg['sum'] / cg['count'] * 100).round(1)
    cg = cg.sort_values('sum', ascending=False)

    # ── Plan churn ────────────────────────────────────────────────────────────
    pg = df.groupby('PlanType')['Churn'].agg(['sum', 'count'])
    pg['churn_rate'] = (pg['sum'] / pg['count'] * 100).round(1)

    # ── Contract churn ────────────────────────────────────────────────────────
    cog = df.groupby('Contract')['Churn'].agg(['sum', 'count'])
    cog['churn_rate'] = (cog['sum'] / cog['count'] * 100).round(1)

    # ── Risk distribution (use churn as proxy for "high risk") ────────────────
    high  = int((df['Churn'] == 1).sum())
    total = len(df)
    med   = int(total * 0.33)   # simulated medium-risk pool
    low   = total - high - med

    return jsonify({
        'tenure_trend': {
            'labels': tg.index.astype(str).tolist(),
            'churned': tg['sum'].tolist(),
            'total':   tg['count'].tolist(),
            'churn_rate': tg['churn_rate'].tolist()
        },
        'city_churn': {
            'labels':     cg.index.tolist(),
            'churned':    [int(x) for x in cg['sum'].tolist()],
            'churn_rate': cg['churn_rate'].tolist()
        },
        'plan_churn': {
            'labels':     pg.index.tolist(),
            'churned':    [int(x) for x in pg['sum'].tolist()],
            'churn_rate': pg['churn_rate'].tolist()
        },
        'contract_churn': {
            'labels':     cog.index.tolist(),
            'churned':    [int(x) for x in cog['sum'].tolist()],
            'churn_rate': cog['churn_rate'].tolist()
        },
        'risk_distribution': {
            'high': high, 'medium': med, 'low': low
        }
    })


@app.route('/api/customers')
def get_customers():
    """Top at-risk customers derived from real data features."""
    sample = df.sample(n=min(50, len(df)), random_state=99).copy()
    # Compute a simple risk score from known patterns
    sample['risk_score'] = (
        (sample['tenure'] < 12).astype(float) * 0.35 +
        (sample['Contract'] == 'Month-to-month').astype(float) * 0.30 +
        (sample['TechSupport'] == 'No').astype(float) * 0.20 +
        (sample['MonthlyCharges'] > 80).astype(float) * 0.15 +
        np.random.default_rng(42).uniform(0, 0.05, len(sample))
    ).clip(0, 1)
    sample['risk_score'] = sample['risk_score'].round(2)
    sample['risk_level'] = sample['risk_score'].apply(
        lambda x: 'high' if x >= 0.65 else ('medium' if x >= 0.40 else 'low')
    )
    top = sample.sort_values('risk_score', ascending=False).head(20)
    records = []
    for i, row in top.iterrows():
        records.append({
            'id': row['customerID'],
            'city': row['City'],
            'plan': row['PlanType'],
            'contract': row['Contract'],
            'tenure': int(row['tenure']),
            'charge': round(float(row['MonthlyCharges']), 0),
            'risk': float(row['risk_score']),
            'level': row['risk_level']
        })
    return jsonify({'customers': records})


@app.route('/api/predict', methods=['POST'])
def predict_churn():
    if best_model is None:
        return jsonify({'error': 'Model not loaded'}), 500

    try:
        data = request.json

        tenure        = float(data.get('tenure', 12))
        monthly       = float(data.get('monthly_charge', 699))
        support_calls = float(data.get('support_calls', 0))
        contract      = data.get('contract', 'Month-to-month')
        internet      = data.get('internet_service', 'DSL')
        security      = data.get('online_security', 'No')
        streaming_tv  = data.get('streaming_tv', 'No')
        streaming_mv  = data.get('streaming_movies', 'No')
        city          = data.get('city', 'Mumbai')
        plan          = data.get('plan_type', 'Standard')
        tech_support  = 'Yes' if support_calls > 0 else 'No'

        input_df = pd.DataFrame([{
            'tenure':               tenure,
            'MonthlyCharges':       monthly,
            'TotalCharges':         tenure * monthly,
            'Contract':             contract,
            'InternetService':      internet,
            'OnlineSecurity':       security,
            'TechSupport':          tech_support,
            'StreamingTV':          streaming_tv,
            'StreamingMovies':      streaming_mv,
            'MonthlyServiceCalls':  support_calls,
            'City':                 city,
            'PlanType':             plan,
        }])

        # Encode categoricals using saved encoders
        for col in input_df.select_dtypes(include='object').columns:
            if col in le_dict:
                le = le_dict[col]
                val = input_df[col].iloc[0]
                if val not in le.classes_:
                    val = le.classes_[0]   # fallback to first known class
                    input_df[col] = val
                input_df[col] = le.transform(input_df[col])

        # Align to training feature order
        input_df = input_df[feature_names]

        # Scale only if scaler was saved (Logistic Regression path)
        if scaler is not None:
            input_arr = scaler.transform(input_df)
        else:
            input_arr = input_df.values

        prob = float(best_model.predict_proba(input_arr)[0][1])
        pred = int(best_model.predict(input_arr)[0])

        # Top contributing factors
        factors = []
        if contract == 'Month-to-month':
            factors.append({'name': 'Month-to-month contract', 'weight': 0.88})
        elif contract == 'One year':
            factors.append({'name': 'Short-term contract', 'weight': 0.55})
        if tenure < 12:
            factors.append({'name': f'Low tenure ({int(tenure)} months)', 'weight': round(max(0.35, 1 - tenure/24), 2)})
        if support_calls > 6:
            factors.append({'name': f'High support calls ({int(support_calls)})', 'weight': round(min(0.95, support_calls/14), 2)})
        if plan == 'Basic':
            factors.append({'name': 'Basic plan (low stickiness)', 'weight': 0.62})
        if security == 'No' and internet != 'No':
            factors.append({'name': 'No online security', 'weight': 0.45})
        factors = sorted(factors, key=lambda x: x['weight'], reverse=True)[:4]

        # Recommendations
        recs = []
        if prob >= 0.7:
            recs = [
                'Escalate to retention team immediately',
                'Offer a 2-month billing credit as a win-back',
                'Propose a discounted annual contract upgrade',
                'Assign a dedicated customer success manager'
            ]
        elif prob >= 0.4:
            recs = [
                'Schedule a proactive satisfaction call this week',
                'Offer Standard → Premium trial period',
                'Send targeted loyalty discount (15% off next 3 months)',
                'Resolve any open support issues first'
            ]
        else:
            recs = [
                'Send NPS / satisfaction survey',
                'Introduce referral incentive program',
                'Offer early annual renewal discount'
            ]

        return jsonify({
            'churn_probability': round(prob * 100, 1),
            'will_churn': bool(pred),
            'status': 'At Risk' if prob > 0.5 else 'Stable',
            'risk_level': 'high' if prob >= 0.70 else ('medium' if prob >= 0.40 else 'low'),
            'factors': factors,
            'recommendations': recs
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/model-info')
def model_info():
    try:
        fi = pd.read_csv(os.path.join(BASE_DIR, 'models/feature_importance.csv'))
        return jsonify({'features': fi.to_dict('records')})
    except Exception as e:
        return jsonify({'features': [], 'error': str(e)})


if __name__ == '__main__':
    app.run(debug=False)
