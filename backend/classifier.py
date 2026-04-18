"""
SDSS Spectral Object Classifier
Uses Random Forest to classify spectral objects as STAR, GALAXY, or QSO
Based on SDSS photometric and spectroscopic features.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import pickle
import os
import logging

logger = logging.getLogger(__name__)

FEATURES = ['u', 'g', 'r', 'i', 'z', 'redshift']
DERIVED_FEATURES = ['u_g', 'g_r', 'r_i', 'i_z', 'g_z']
ALL_FEATURES = FEATURES + DERIVED_FEATURES
CLASSES = ['STAR', 'GALAXY', 'QSO']
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')


def add_color_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute SDSS color indices from photometric magnitudes."""
    df = df.copy()
    df['u_g'] = df['u'] - df['g']
    df['g_r'] = df['g'] - df['r']
    df['r_i'] = df['r'] - df['i']
    df['i_z'] = df['i'] - df['z']
    df['g_z'] = df['g'] - df['z']
    return df


def generate_training_data(n_samples: int = 15000) -> tuple:
    """
    Generate synthetic SDSS-like training data based on known
    photometric and spectroscopic distributions for each class.
    """
    np.random.seed(42)
    records = []
    labels = []
    n_each = n_samples // 3

    # --- STARS ---
    # Nearby objects: redshift ≈ 0, stellar colors (red/orange sequence)
    for _ in range(n_each):
        r = np.random.uniform(14.0, 22.5)
        u_g = np.random.normal(1.35, 0.35)   # typical stellar u-g
        g_r = np.random.normal(0.52, 0.22)
        r_i = np.random.normal(0.28, 0.15)
        i_z = np.random.normal(0.18, 0.12)
        u = r + g_r + u_g
        g = r + g_r
        i = r - r_i
        z = i - i_z
        redshift = np.random.normal(0.0, 0.0005)
        records.append([u, g, r, i, z, max(-0.001, redshift)])
        labels.append('STAR')

    # --- GALAXIES ---
    # 0 < z < ~1.0, redder colors, fainter on average
    for _ in range(n_each):
        redshift = np.abs(np.random.normal(0.18, 0.15))
        redshift = min(redshift, 1.2)
        r = np.random.normal(17.5, 2.0)
        # Galaxy colors shift redward with redshift
        g_r = np.random.normal(0.62 + 0.15 * redshift, 0.25)
        u_g = np.random.normal(1.55 + 0.3 * redshift, 0.4)
        r_i = np.random.normal(0.40 + 0.12 * redshift, 0.18)
        i_z = np.random.normal(0.22 + 0.08 * redshift, 0.14)
        g = r + g_r
        u = g + u_g
        i = r - r_i
        z = i - i_z
        records.append([u, g, r, i, z, redshift])
        labels.append('GALAXY')

    # --- QSOs (Quasars) ---
    # High redshift, UV excess (blue), point-like
    for _ in range(n_each):
        redshift = np.abs(np.random.exponential(1.2)) + 0.08
        redshift = min(redshift, 5.5)
        u = np.random.normal(19.8, 1.8)
        # QSOs are UV excess: u-g can be very blue or variable
        u_g = np.random.normal(-0.12 + 0.08 * redshift, 0.55)
        g_r = np.random.normal(0.05 + 0.12 * redshift, 0.45)
        r_i = np.random.normal(0.08 + 0.10 * redshift, 0.38)
        i_z = np.random.normal(0.06 + 0.07 * redshift, 0.30)
        g = u - u_g
        r = g - g_r
        i = r - r_i
        z = i - i_z
        records.append([u, g, r, i, z, redshift])
        labels.append('QSO')

    df = pd.DataFrame(records, columns=FEATURES)
    # Add noise to simulate real observational errors
    for col in ['u', 'g', 'r', 'i', 'z']:
        df[col] += np.random.normal(0, 0.05, len(df))
    return df, labels


def train_model() -> RandomForestClassifier:
    """Train the Random Forest classifier on synthetic SDSS data."""
    logger.info("Generating training data...")
    df, labels = generate_training_data(n_samples=18000)
    df = add_color_features(df)

    X = df[ALL_FEATURES].values
    y = np.array(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )

    logger.info("Training Random Forest classifier...")
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_split=4,
        min_samples_leaf=2,
        max_features='sqrt',
        class_weight='balanced',
        n_jobs=-1,
        random_state=42
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    logger.info(f"Test accuracy: {acc:.4f}")
    logger.info("\n" + classification_report(y_test, y_pred, target_names=CLASSES))

    # Save model
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump({'clf': clf, 'accuracy': acc, 'features': ALL_FEATURES}, f)
    logger.info(f"Model saved to {MODEL_PATH}")

    return clf, acc


def load_or_train() -> tuple:
    """Load existing model or train a new one."""
    if os.path.exists(MODEL_PATH):
        logger.info("Loading existing model...")
        with open(MODEL_PATH, 'rb') as f:
            obj = pickle.load(f)
        return obj['clf'], obj.get('accuracy', None)
    else:
        logger.info("No model found, training...")
        return train_model()


def validate_sdss_row(row: dict) -> dict:
    """Validate and coerce a single SDSS data row."""
    cleaned = {}
    for feat in FEATURES:
        val = row.get(feat)
        if val is None:
            raise ValueError(f"Missing required field: '{feat}'")
        try:
            cleaned[feat] = float(val)
        except (TypeError, ValueError):
            raise ValueError(f"Field '{feat}' must be numeric, got: {val!r}")
    # Optional fields - pass through as metadata
    for opt in ['ra', 'dec', 'plate', 'mjd', 'fiberid', 'objid', 'specobjid']:
        if opt in row:
            cleaned[opt] = row[opt]
    return cleaned


def classify(records: list, clf: RandomForestClassifier) -> list:
    """
    Classify a list of SDSS records.

    Args:
        records: list of dicts with SDSS feature fields
        clf: trained RandomForestClassifier

    Returns:
        list of prediction dicts with class, confidence, probabilities
    """
    validated = []
    errors = []
    for i, row in enumerate(records):
        try:
            validated.append(validate_sdss_row(row))
        except ValueError as e:
            errors.append({'row': i + 1, 'error': str(e)})

    if errors:
        raise ValueError(f"Validation errors: {errors}")

    df = pd.DataFrame(validated)[FEATURES]
    df = add_color_features(df)
    X = df[ALL_FEATURES].values

    probs = clf.predict_proba(X)
    class_order = list(clf.classes_)

    results = []
    for idx, (row, prob_arr) in enumerate(zip(validated, probs)):
        prob_dict = {cls: float(prob_arr[class_order.index(cls)]) for cls in CLASSES}
        predicted_class = CLASSES[np.argmax([prob_dict[c] for c in CLASSES])]
        confidence = max(prob_dict.values())
        results.append({
            'id': idx + 1,
            'class': predicted_class,
            'confidence': round(confidence, 4),
            'probabilities': {k: round(v, 4) for k, v in prob_dict.items()},
            'input': {k: row[k] for k in FEATURES},
        })

    return results
