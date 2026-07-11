from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64


def _get_raw_key() -> bytes:
    # Import here to avoid circular imports at module load time.
    from app.config import settings
    # Prefer a dedicated ENCRYPTION_KEY; fall back to the JWT SECRET_KEY.
    # Never fall back to Fernet.generate_key() — that produces a new key on
    # every restart and makes all previously encrypted passwords unreadable.
    raw = settings.ENCRYPTION_KEY or settings.SECRET_KEY
    return raw.encode()


def get_fernet() -> Fernet:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"hireflow_salt",
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(_get_raw_key()))
    return Fernet(key)

def encrypt_password(password: str) -> str:
    """Encrypt a password for storage."""
    fernet = get_fernet()
    encrypted = fernet.encrypt(password.encode())
    return encrypted.decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a password from storage."""
    fernet = get_fernet()
    decrypted = fernet.decrypt(encrypted_password.encode())
    return decrypted.decode()
