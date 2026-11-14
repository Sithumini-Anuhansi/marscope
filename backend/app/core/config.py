import os

class Settings:
    app_name = "MARSCOPE API"
    cors_origins = [origin.strip() for origin in os.getenv("MARSCOPE_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]

settings = Settings()
