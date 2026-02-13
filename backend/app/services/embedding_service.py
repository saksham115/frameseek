from google.oauth2 import service_account

from app.config import settings
from app.repositories.vector_db import VECTOR_SIZE


class EmbeddingService:
    """Generates embeddings using Vertex AI with service account authentication."""

    def __init__(self):
        self._model = None

    def _get_model(self):
        if self._model is None:
            from google.cloud import aiplatform
            from vertexai.vision_models import MultiModalEmbeddingModel

            credentials = service_account.Credentials.from_service_account_file(
                settings.GCP_SERVICE_ACCOUNT_PATH
            )
            aiplatform.init(
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
                credentials=credentials,
            )
            self._model = MultiModalEmbeddingModel.from_pretrained("multimodalembedding@001")
        return self._model

    async def generate_image_embedding(self, image_path: str) -> list[float]:
        model = self._get_model()
        from vertexai.vision_models import Image
        image = Image.load_from_file(image_path)
        embeddings = model.get_embeddings(image=image, dimension=VECTOR_SIZE)
        return embeddings.image_embedding

    async def generate_text_embedding(self, text: str) -> list[float]:
        model = self._get_model()
        embeddings = model.get_embeddings(contextual_text=text, dimension=VECTOR_SIZE)
        return embeddings.text_embedding
