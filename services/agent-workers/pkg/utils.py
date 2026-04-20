import re

def sanitize_name(name: str) -> str:
    """Sanitizes a string to be URL-friendly (lowercase, hyphens)."""
    # Remove leading/trailing whitespace, lowercase
    s = name.strip().lower()
    # Replace non-alphanumeric with hyphens
    s = re.sub(r'[^a-z0-9]+', '-', s)
    # Remove duplicate hyphens
    s = re.sub(r'-+', '-', s)
    return s.strip('-')
