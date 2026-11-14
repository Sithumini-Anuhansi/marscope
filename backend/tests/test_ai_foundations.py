from app.services import terrain_classifier_service as terrain
from app.schemas.ai import AISynthesisRequest
from app.services.risk_synthesis_service import synthesize_risk_assessment


def test_terrain_classifier_stays_unavailable_without_reviewed_model(monkeypatch):
    monkeypatch.delenv(terrain.MODEL_VERSION_ENV, raising=False)

    status = terrain.terrain_classifier_status()

    assert status["status"] == "model-unavailable"
    assert status["risk_labels_available"] is False
    assert status["probability_calibrated"] is False
    assert status["model_version"] is None


def test_terrain_inference_does_not_invent_predictions_without_model(monkeypatch):
    monkeypatch.delenv(terrain.MODEL_VERSION_ENV, raising=False)

    result = terrain.classify_terrain_image(b"image bytes are not training data", "image/jpeg")

    assert result["assessment_status"] == "unavailable"
    assert result["terrain_classes"] == []
    assert result["model_version"] is None


def test_risk_synthesis_remains_unclassified_without_validated_model():
    result = synthesize_risk_assessment(AISynthesisRequest(latitude_deg=0, longitude_deg=0))

    assert result["overall_assessment"] == "unclassified"
    assert result["risk_model"] == {
        "status": "not-trained",
        "risk_prediction": None,
        "risk_score": None,
        "confidence": None,
    }
    assert result["survival_or_mission_success_probability"] is None
