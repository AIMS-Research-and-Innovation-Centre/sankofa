"""DSpace REST integration used by Sankofa's repository layer."""

from .client import DSpaceClient, DSpaceError, DSpaceNotConfigured

__all__ = ["DSpaceClient", "DSpaceError", "DSpaceNotConfigured"]
