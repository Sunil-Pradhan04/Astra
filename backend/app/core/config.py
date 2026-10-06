from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    DB_NAME: str = "astra_db"
    JWT_SECRET: str = "change_this_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = ""
    FROM_NAME: str = "Astra Healthcare"

    FRONTEND_URL: str = "http://localhost:5173"
    SARVAM_AI_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"

    # OpenAI (Embeddings only for Pinecone vector retrieval) + Pinecone Index
    OPENAI_API_KEY: str = ""
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "astra-diseases"

    # Cloudinary Image Storage
    CLOUDINARY_API_KEY_NAME: str = "Astra"
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_CLOUD_NAME: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
