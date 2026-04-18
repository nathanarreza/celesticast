# CelastiCast — Spectral Object Classifier

An AI-powered web platform for classifying SDSS spectral objects (Stars, Galaxies, QSOs)
using a Random Forest model trained on photometric magnitudes and spectroscopic redshift.

---

## Project Structure

```
celesticast/
├── frontend/               # Static HTML/CSS/JS (Vercel)
│   ├── index.html          # Home page
│   ├── analyze.html        # Data input (CSV / manual / paste)
│   ├── results.html        # Classification results
│   ├── css/style.css
│   └── js/
│       ├── stars.js        # Canvas star field animation
│       ├── analyze.js      # Input page logic
│       └── results.js      # Results rendering
├── backend/                # Python Flask API (GCP Cloud Run)
│   ├── app.py              # Flask routes
│   ├── classifier.py       # Random Forest model (train + infer)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .gcloudignore
├── vercel.json             # Vercel static hosting config
└── README.md
```

---

## Input Format (SDSS)

The classifier expects these six required columns (SDSS DR17 format):

| Column     | Description                    | Typical Range |
|------------|--------------------------------|---------------|
| `u`        | Ultraviolet filter magnitude   | 14 – 23       |
| `g`        | Green filter magnitude         | 14 – 23       |
| `r`        | Red filter magnitude           | 14 – 23       |
| `i`        | Near-infrared filter magnitude | 14 – 23       |
| `z`        | Infrared filter magnitude      | 14 – 23       |
| `redshift` | Spectroscopic redshift         | 0 – 5.5       |

Optional columns (`ra`, `dec`, `plate`, `mjd`, `fiberid`) are accepted but not used in classification.

---

## Running Locally

### Prerequisites

- Python 3.11+
- pip
- A modern browser (Chrome, Firefox, Safari, Edge)
- (Optional) Node.js for a local static file server

### 1. Start the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # macOS/Linux
# OR: venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Start the dev server (trains the model on first run ~5–10 seconds)
python app.py
```

The API will be available at `http://localhost:8080`.

**Health check:**
```bash
curl http://localhost:8080/api/health
```

**Test with sample data:**
```bash
curl -X POST http://localhost:8080/api/classify \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {"u": 19.84, "g": 19.52, "r": 19.46, "i": 19.17, "z": 19.10, "redshift": 0.0},
      {"u": 20.10, "g": 18.90, "r": 18.20, "i": 17.85, "z": 17.60, "redshift": 0.083},
      {"u": 19.20, "g": 19.35, "r": 19.28, "i": 19.05, "z": 18.92, "redshift": 1.421}
    ]
  }'
```

### 2. Serve the Frontend

**Option A — Python (simplest):**
```bash
cd frontend
python -m http.server 3000
```
Open `http://localhost:3000` in your browser.

**Option B — Node.js (npx):**
```bash
cd frontend
npx serve .
```

**Option C — VS Code Live Server extension:**  
Right-click `frontend/index.html` → "Open with Live Server".

### 3. Connect Frontend to Backend

In the **Analyze** page, the **Backend URL** field defaults to `http://localhost:8080`.
Leave it as-is for local development.

---

## Deploying the Backend to GCP Cloud Run

### Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A GCP project with Cloud Run and Artifact Registry APIs enabled
- Docker installed locally

### Step 1 — Set up GCP project variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"           # change to your preferred region
export SERVICE_NAME="celesticast-api"
export REPO_NAME="celesticast"
```

### Step 2 — Create Artifact Registry repository

```bash
gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID
```

### Step 3 — Configure Docker authentication

```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### Step 4 — Build and push the Docker image

```bash
cd backend

# Build (model is pre-trained during Docker build — cold starts will be fast)
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest .

# Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest
```

### Step 5 — Deploy to Cloud Run

```bash
gcloud run deploy $SERVICE_NAME \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --timeout=120 \
  --project=$PROJECT_ID
```

After deployment, Cloud Run will output a service URL like:
```
https://celesticast-api-xxxxxxxxxx-uc.a.run.app
```

### Step 6 — Test the deployed API

```bash
export API_URL="https://celesticast-api-xxxxxxxxxx-uc.a.run.app"

curl ${API_URL}/api/health
```

---

## Deploying the Frontend to Vercel

### Prerequisites

- [Vercel CLI](https://vercel.com/docs/cli) installed: `npm i -g vercel`
- A Vercel account (free tier is sufficient)

### Step 1 — Update the default backend URL

Edit `frontend/js/analyze.js`, line 3:
```js
// Change this to your Cloud Run URL:
const DEFAULT_API = 'https://celesticast-api-xxxxxxxxxx-uc.a.run.app';
```

### Step 2 — Deploy

```bash
# From the repo root
vercel

# Follow the prompts:
# - Link to existing project or create new
# - Set root directory to: . (repo root)
# - Vercel will detect vercel.json automatically
```

For subsequent deploys:
```bash
vercel --prod
```

### Step 3 — Set environment / verify

Once deployed, open the Vercel URL and navigate to **Analyze**.
The **Backend URL** field should already show your Cloud Run URL.

---

## CORS Configuration

The backend allows requests from:
- `http://localhost:*`
- `https://*.vercel.app`
- `https://*.celesticast.io`

To add your custom domain, edit the `origins` list in `backend/app.py`:
```python
CORS(app, origins=[
    ...
    "https://your-custom-domain.com",
])
```

Redeploy the backend after any change.

---

## API Reference

### `GET /api/health`
Returns model status and required fields.

### `GET /api/sample`
Returns five sample SDSS objects for testing.

### `POST /api/classify`
Classify objects from JSON.

**Body:**
```json
{
  "records": [
    { "u": 19.84, "g": 19.52, "r": 19.46, "i": 19.17, "z": 19.10, "redshift": 0.0 }
  ]
}
```

**Response:**
```json
{
  "predictions": [
    {
      "id": 1,
      "class": "STAR",
      "confidence": 0.94,
      "probabilities": { "STAR": 0.94, "GALAXY": 0.04, "QSO": 0.02 },
      "input": { "u": 19.84, "g": 19.52, "r": 19.46, "i": 19.17, "z": 19.10, "redshift": 0.0 }
    }
  ],
  "summary": { "total": 1, "counts": { "STAR": 1, "GALAXY": 0, "QSO": 0 }, "avg_confidence": 0.94 },
  "model_info": { "algorithm": "Random Forest", "n_estimators": 200, "accuracy": 0.974 }
}
```

### `POST /api/classify/csv`
Classify from a CSV file upload or pasted CSV text.

**Multipart file upload:**
```bash
curl -X POST http://localhost:8080/api/classify/csv \
  -F "file=@sdss_data.csv"
```

**JSON with csv_text:**
```bash
curl -X POST http://localhost:8080/api/classify/csv \
  -H "Content-Type: application/json" \
  -d '{"csv_text": "u,g,r,i,z,redshift\n19.84,19.52,19.46,19.17,19.10,0.0"}'
```

---

## Model Details

| Parameter        | Value                          |
|------------------|--------------------------------|
| Algorithm        | Random Forest Classifier       |
| Estimators       | 200 trees                      |
| Max depth        | 20                             |
| Features used    | u, g, r, i, z, redshift + derived color indices (u-g, g-r, r-i, i-z, g-z) |
| Training samples | ~18,000 synthetic SDSS-distribution objects |
| Classes          | STAR, GALAXY, QSO              |
| Typical accuracy | ~97% on held-out test set      |

The model is trained at Docker build time and cached as `model.pkl`.
Subsequent container restarts do not retrain.

To replace with a real SDSS-trained model, place your `model.pkl` in the `backend/` directory
before building the Docker image, and update `classifier.py` accordingly.

---

## Developing & Retraining

To force model retraining:
```bash
cd backend
rm -f model.pkl
python -c "from classifier import train_model; train_model()"
```

To swap in real SDSS data, modify `generate_training_data()` in `classifier.py`
to load from a CSV file instead of generating synthetic data.

---

## License

MIT
#   c e l e s t i c a s t  
 #   c e l e s t i c a s t  
 