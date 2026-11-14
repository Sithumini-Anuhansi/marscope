import pytest

from app.data_processing.mars_coordinates import (
    normalize_east_longitude,
    point_feature,
    raster_cell_center,
    validate_planetocentric,
)


def test_raster_cell_center_uses_planetocentric_positive_east_coordinates():
    longitude, latitude = raster_cell_center(0, 0)
    assert longitude == pytest.approx(0.125)
    assert latitude == pytest.approx(89.875)


def test_longitude_wraps_to_geojson_range():
    assert normalize_east_longitude(360) == pytest.approx(0)
    assert normalize_east_longitude(180) == pytest.approx(-180)


def test_invalid_latitude_and_non_finite_longitude_are_rejected():
    with pytest.raises(ValueError):
        validate_planetocentric(90.1, 0)
    with pytest.raises(ValueError):
        normalize_east_longitude(float("nan"))


def test_geojson_feature_records_coordinate_convention():
    feature = point_feature(190, -5, {"source": "test-input"})
    assert feature["geometry"]["coordinates"] == [-170, -5]
    assert feature["properties"]["latitude_type"] == "planetocentric"
    assert feature["properties"]["longitude_direction"] == "positive-east"
