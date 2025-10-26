# train_model.py
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
import joblib

# --- Step 1: Example dataset (replace with real one later)
data = {
    "headline": [
        "Pope endorses Donald Trump for President",
        "NASA confirms water on Mars surface",
        "Cure for cancer found in green tea",
        "Stock markets hit record high after inflation cools",
        "Aliens landed in Nevada desert says local farmer",
        "WHO approves new malaria vaccine for children"
    ],
    "label": [1, 0, 1, 0, 1, 0]  # 1 = fake, 0 = real
}
df = pd.DataFrame(data)

# --- Step 2: Split data
X_train, X_test, y_train, y_test = train_test_split(
    df["headline"], df["label"], test_size=0.2, random_state=42
)

# --- Step 3: Create pipeline
model = Pipeline([
    ("tfidf", TfidfVectorizer(stop_words="english")),
    ("clf", LogisticRegression())
])

# --- Step 4: Train
model.fit(X_train, y_train)

# --- Step 5: Evaluate (optional)
print("Training complete. Example accuracy:", model.score(X_test, y_test))

# --- Step 6: Save model
joblib.dump(model, "misinfo_model.pkl")
print("Model saved as misinfo_model.pkl")
