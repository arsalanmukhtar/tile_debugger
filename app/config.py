from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MAPBOX_ACCESS_TOKEN: str  # Make sure this matches your .env variable name
    DBHOST: str
    DBNAME: str
    DBUSER: str
    DBPASSWORD: str
    DBPORT: str

    class Config:
        env_file = ".env"
        env_file_encoding = 'utf-8'
        extra = 'ignore'

settings = Settings()