"""
Blob Storage Service
Falls back to local disk storage when Azure credentials are not configured.
"""

import os
from pathlib import Path

from loguru import logger
from infrastructure.config import get_settings

settings = get_settings()

LOCAL_STORAGE_DIR = Path("/tmp/express_entry_uploads")


class BlobStorageService:
    def __init__(self):
        self._use_azure = bool(
            settings.AZURE_STORAGE_CONNECTION_STRING
            and "your_connection_string" not in settings.AZURE_STORAGE_CONNECTION_STRING
        )
        if self._use_azure:
            logger.info("BlobStorageService: using Azure Blob Storage")
        else:
            LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
            logger.warning(
                "BlobStorageService: Azure not configured — "
                "using local disk at /tmp/express_entry_uploads"
            )

    async def upload(self, container: str, blob_name: str, data: bytes, content_type: str) -> str:
        if self._use_azure:
            return await self._upload_azure(container, blob_name, data, content_type)
        return await self._upload_local(blob_name, data)

    async def _upload_azure(self, container: str, blob_name: str, data: bytes, content_type: str) -> str:
        logger.info(f"BlobStorage.upload_azure: container={container}  blob={blob_name[:60]}  size={len(data)}B  type={content_type}")
        import time; t0 = time.perf_counter()
        from azure.storage.blob.aio import BlobServiceClient
        from azure.storage.blob import ContentSettings
        # Fresh client per call — never reuse; context manager closes connections
        async with BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        ) as client:
            container_client = client.get_container_client(container)
            try:
                await container_client.create_container()
            except Exception:
                pass  # Container already exists
            blob_client = container_client.get_blob_client(blob_name)
            await blob_client.upload_blob(
                data,
                content_settings=ContentSettings(content_type=content_type),
                overwrite=True
            )
            url = blob_client.url
            logger.info(f"BlobStorage.upload_azure: done in {(time.perf_counter()-t0)*1000:.0f}ms  url={url[:60]}")
            return url

    async def _upload_local(self, blob_name: str, data: bytes) -> str:
        logger.info(f"BlobStorage.upload_local: blob={blob_name[:60]}  size={len(data)}B")
        safe_name = blob_name.replace("/", "__")
        dest = LOCAL_STORAGE_DIR / safe_name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        logger.info(f"BlobStorage.upload_local: saved to {dest}")
        return f"/local-storage/{safe_name}"

    async def download(self, blob_url: str) -> bytes:
        logger.info(f"BlobStorage.download: url={blob_url[:80]}")

        # Local storage fallback
        if blob_url.startswith("/local-storage/"):
            filename = blob_url.removeprefix("/local-storage/")
            path = LOCAL_STORAGE_DIR / filename
            if path.exists():
                return path.read_bytes()
            raise FileNotFoundError(f"Local file not found: {path}")

        # Azure URL — must use SDK with credentials (public access is disabled)
        if self._use_azure and "blob.core.windows.net" in blob_url:
            from azure.storage.blob.aio import BlobServiceClient
            from urllib.parse import urlparse, unquote
            # Decode URL — filenames with spaces get double-encoded (%20 → %2520)
            # Unquote once to get the canonical path Azure expects
            blob_url_decoded = unquote(blob_url)
            parsed = urlparse(blob_url_decoded)
            # path is /<container>/<blob_path...>
            # e.g. /express-entry-documents/applicant_id/type/person/uuid/file.pdf
            path_parts = parsed.path.lstrip("/").split("/", 1)
            if len(path_parts) != 2:
                raise ValueError(f"Cannot parse blob URL: {blob_url!r}  path={parsed.path!r}")
            container_name, blob_name = path_parts
            logger.info(f"BlobStorage.download: container={container_name!r}  blob={blob_name[:80]!r}")
            import asyncio
            for attempt in range(3):
                try:
                    async with BlobServiceClient.from_connection_string(
                        settings.AZURE_STORAGE_CONNECTION_STRING
                    ) as client:
                        blob_client = client.get_blob_client(
                            container=container_name, blob=blob_name
                        )
                        stream = await blob_client.download_blob()
                        data = await stream.readall()
                        logger.info(f"BlobStorage.download: downloaded {len(data)}B via SDK (attempt {attempt+1})")
                        return data
                except Exception as e:
                    if attempt < 2 and "BlobNotFound" in str(e):
                        logger.warning(f"BlobStorage.download: BlobNotFound attempt {attempt+1}/3 — waiting 3s before retry")
                        await asyncio.sleep(3)
                        continue
                    raise

        # Fallback: plain HTTP (only if container has public access)
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(blob_url)
            response.raise_for_status()
            return response.content

    async def delete(self, container: str, blob_name: str):
        logger.info(f"BlobStorage.delete: container={container}  blob={blob_name[:60]}")
        if not self._use_azure:
            safe_name = blob_name.replace("/", "__")
            path = LOCAL_STORAGE_DIR / safe_name
            if path.exists():
                path.unlink()
            return
        from azure.storage.blob.aio import BlobServiceClient
        async with BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        ) as client:
            await client.get_container_client(container).delete_blob(blob_name)
