"""Metadata catalog only. No dataset is claimed as locally downloaded or validated."""
DATASETS = [
    {"id": "mola", "name": "Mars Orbiter Laser Altimeter", "source": "NASA Planetary Data System", "status": "planned", "downloaded": False, "validated": False, "measurement_units": "product-dependent; inspect product label"},
    {"id": "themis", "name": "Thermal Emission Imaging System", "source": "NASA Planetary Data System", "status": "planned", "downloaded": False, "validated": False, "measurement_units": "product-dependent; inspect product label"},
    {"id": "ctx", "name": "Context Camera", "source": "NASA Planetary Data System", "status": "planned", "downloaded": False, "validated": False, "measurement_units": "image data"},
    {"id": "hirise", "name": "High Resolution Imaging Science Experiment", "source": "NASA Planetary Data System", "status": "planned", "downloaded": False, "validated": False, "measurement_units": "product-dependent; inspect product label"},
    {"id": "atmosphere", "name": "Mars atmospheric datasets", "source": "NASA archives; product-specific", "status": "planned", "downloaded": False, "validated": False, "measurement_units": "product-dependent; inspect product label"},
]
