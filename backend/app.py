"""
CelastiCast Backend API
Flask server providing SDSS spectral classification via Random Forest.
"""

import os
import io
import logging
import json
import csv

from flask import Flask, request, jsonify
from flask_cors import CORS

from classifier import load_or_train, classify, FEATURES, CLASSES

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:*",
    "https://*.vercel.app",
    "https://*.celesticast.io",
])

# Load model at startup
clf = None
model_accuracy = None


@app.before_request
def ensure_model():
    global clf, model_accuracy
    if clf is None:
        clf, model_accuracy = load_or_train()


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': clf is not None,
        'model_accuracy': model_accuracy,
        'required_fields': FEATURES,
        'classes': CLASSES,
    })


@app.route('/api/classify', methods=['POST'])
def classify_json():
    """
    Classify SDSS objects from JSON input.

    Body: { "records": [ { "u":..., "g":..., "r":..., "i":..., "z":..., "redshift":... }, ... ] }
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({'error': 'Request body must be JSON'}), 400

    records = body.get('records')
    if not records or not isinstance(records, list):
        return jsonify({'error': 'JSON body must contain a "records" array'}), 400

    if len(records) > 5000:
        return jsonify({'error': 'Maximum 5000 records per request'}), 400

    try:
        predictions = classify(records, clf)
    except ValueError as e:
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        logger.exception("Classification failed")
        return jsonify({'error': 'Internal classification error'}), 500

    summary = _build_summary(predictions)
    return jsonify({
        'predictions': predictions,
        'summary': summary,
        'model_info': {
            'algorithm': 'Random Forest',
            'n_estimators': clf.n_estimators,
            'accuracy': round(model_accuracy, 4) if model_accuracy else None,
        }
    })


@app.route('/api/classify/csv', methods=['POST'])
def classify_csv():
    """
    Classify SDSS objects from uploaded CSV file or pasted CSV text.

    Multipart: file field named 'file'
    OR JSON body: { "csv_text": "u,g,r,i,z,redshift\n..." }
    """
    csv_text = None

    if 'file' in request.files:
        f = request.files['file']
        if not f.filename:
            return jsonify({'error': 'No file selected'}), 400
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ('.csv', '.txt'):
            return jsonify({'error': 'Only .csv files are supported'}), 400
        try:
            csv_text = f.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return jsonify({'error': 'File encoding not supported. Please use UTF-8.'}), 400

    elif request.is_json:
        body = request.get_json()
        csv_text = body.get('csv_text', '')
        if not csv_text:
            return jsonify({'error': 'Missing csv_text field'}), 400
    else:
        return jsonify({'error': 'Send a CSV file via multipart or csv_text via JSON'}), 400

    try:
        records = _parse_csv(csv_text)
    except Exception as e:
        return jsonify({'error': f'CSV parse error: {str(e)}'}), 422

    if not records:
        return jsonify({'error': 'CSV contains no data rows'}), 400

    if len(records) > 5000:
        return jsonify({'error': 'Maximum 5000 rows per request'}), 400

    try:
        predictions = classify(records, clf)
    except ValueError as e:
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        logger.exception("Classification failed")
        return jsonify({'error': 'Internal classification error'}), 500

    summary = _build_summary(predictions)
    return jsonify({
        'predictions': predictions,
        'summary': summary,
        'model_info': {
            'algorithm': 'Random Forest',
            'n_estimators': clf.n_estimators,
            'accuracy': round(model_accuracy, 4) if model_accuracy else None,
        }
    })


@app.route('/api/sample', methods=['GET'])
def sample_data():
    """Return sample SDSS data for testing."""
    samples = [
        {'u': 19.84, 'g': 19.52, 'r': 19.46, 'i': 19.17, 'z': 19.10, 'redshift': 0.0, 'label_hint': 'STAR'},
        {'u': 20.10, 'g': 18.90, 'r': 18.20, 'i': 17.85, 'z': 17.60, 'redshift': 0.083, 'label_hint': 'GALAXY'},
        {'u': 19.20, 'g': 19.35, 'r': 19.28, 'i': 19.05, 'z': 18.92, 'redshift': 1.421, 'label_hint': 'QSO'},
        {'u': 18.50, 'g': 17.80, 'r': 17.35, 'i': 17.10, 'z': 16.95, 'redshift': 0.0, 'label_hint': 'STAR'},
        {'u': 21.20, 'g': 19.75, 'r': 18.95, 'i': 18.50, 'z': 18.20, 'redshift': 0.312, 'label_hint': 'GALAXY'},
    ]
    return jsonify({'samples': samples, 'required_fields': FEATURES})


def _parse_csv(csv_text: str) -> list:
    """Parse CSV text into list of record dicts."""
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    rows = []
    for i, row in enumerate(reader):
        # Normalize header names (lowercase, strip spaces)
        normalized = {k.strip().lower(): v.strip() for k, v in row.items()}
        rows.append(normalized)
        if i >= 4999:
            break
    return rows


def _build_summary(predictions: list) -> dict:
    counts = {cls: 0 for cls in CLASSES}
    total_conf = 0.0
    for p in predictions:
        counts[p['class']] += 1
        total_conf += p['confidence']
    return {
        'total': len(predictions),
        'counts': counts,
        'avg_confidence': round(total_conf / len(predictions), 4) if predictions else 0,
    }


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"Starting CelastiCast backend on port {port}")
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', '0') == '1')
