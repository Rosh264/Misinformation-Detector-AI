import joblib
import os

# Make sure you are in the 'server' directory when running this
model_path = "misinfo_model.pkl"

if not os.path.exists(model_path):
    print(f"Error: Model file not found at {model_path}")
else:
    try:
        model = joblib.load(model_path)
        print("Model loaded successfully!")

        # Test headlines
        test_headlines = [
            "Pope endorses Trump for president", # Should be misleading/caution
            "Local council meets to discuss budget cuts", # Should be verified
            "You won't believe what happened next!", # Could be flagged as caution (if AI is basic)
            "Breaking news: Scientists discover cure for common cold", # Could be misleading/caution if AI is skeptical
            "This is a normal headline about everyday life." # Verified
        ]

        for headline in test_headlines:
            pred = model.predict([headline])[0]
            # Assuming 0 for verified, 1 for caution/misleading based on your main.py
            status = "MISLEADING" if pred == 1 else "VERIFIED"
            print(f"Headline: '{headline}' -> Prediction: {status} ({pred})")

    except Exception as e:
        print(f"Error loading or predicting with model: {e}")