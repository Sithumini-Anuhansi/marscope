import json
import shutil
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("rasterio", reason="Install backend/requirements-geo.txt to test geospatial processing")
import rasterio

from app.data_processing.mola import (
    NODATA,
    RasterValidationError,
    _terrain_chunk,
    process_mola,
    validate_mola_source,
)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "mola"


def test_terrain_derivatives_are_finite_and_aspect_is_directional():
    rows, cols = np.mgrid[:8, :16]
    plane = (rows * 3 + cols * 5).astype(">i2")
    slope, aspect, roughness = _terrain_chunk(plane, 0, 8, 8, 16, 1000, 1000)
    assert slope.shape == plane.shape
    assert np.isfinite(slope).all()
    assert ((aspect == NODATA) | ((aspect >= 0) & (aspect < 360))).all()
    assert (roughness >= 0).all()
    assert (slope > 0).any()
    chunked = [
        _terrain_chunk(plane, start, stop, 8, 16, 1000, 1000)
        for start, stop in ((0, 3), (3, 6), (6, 8))
    ]
    for band, expected in enumerate((slope, aspect, roughness)):
        assert np.allclose(np.concatenate([part[band] for part in chunked]), expected)


@pytest.mark.skipif(not RAW.exists(), reason="The genuine MOLA sample is git-ignored; run the documented ingestion command")
def test_genuine_pds_sample_validates_and_processes(tmp_path: Path):
    source = validate_mola_source(RAW)
    assert source[5:7] == (720, 1440)
    assert source[7] == pytest.approx(14817.845349)
    result = process_mola(RAW, tmp_path / "processed", chunk_rows=16)
    manifest_path = Path(result["output_directory"]) / "processing-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert set(manifest["outputs"]) == {"elevation", "slope", "aspect", "roughness"}
    for output in manifest["outputs"].values():
        with rasterio.open(Path(result["output_directory"]) / output["file"]) as dataset:
            assert (dataset.height, dataset.width) == (720, 1440)
            assert dataset.crs is not None
            assert dataset.tags()["latitude_type"] == "planetocentric"
            assert dataset.nodata == NODATA


@pytest.mark.skipif(not RAW.exists(), reason="The genuine MOLA sample is git-ignored; run the documented ingestion command")
def test_corrupted_ingestion_manifest_is_rejected(tmp_path: Path):
    copied = tmp_path / "mola"
    shutil.copytree(RAW, copied)
    manifest_path = copied / "megt90n000cb.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sha256"]["image"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(RasterValidationError, match="SHA-256"):
        validate_mola_source(copied)
