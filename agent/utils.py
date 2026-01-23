"""
Utility functions to use in agent/main.py
"""

# Character mapping for problematic characters that may get normalised by LLM
CHAR_PLACEHOLDERS = {
    '\r': '[u+000D]',      # Carriage return \r  
    '\u201C': '[u+201C]',  # Left double quote
    '\u201D': '[u+201D]',  # Right double quote  
    '\u2018': '[u+2018]',  # Left single quote
    '\u2019': '[u+2019]',  # Right single quote
    '\u2013': '[u+2013]',  # En dash
    '\u2014': '[u+2014]',  # Em dash
    '\u2026': '[u+2026]',  # Ellipsis
}


def convert_to_placeholders(text: str) -> str:
    """Convert problematic characters to placeholders for LLM processing"""
    if not text:
        return ''
    for char, placeholder in CHAR_PLACEHOLDERS.items():
        text = text.replace(char, placeholder)
    return text


def convert_from_placeholders(text: str) -> str:
    """Convert placeholders back to original characters"""
    for char, placeholder in CHAR_PLACEHOLDERS.items():
        text = text.replace(placeholder, char)
    return text


def remove_thinking_tags(response_str):
    """Remove <thinking> tags and content from agent responses"""
    if "<thinking>" in response_str and "</thinking>" in response_str:
        thinking_start = response_str.find("<thinking>")
        thinking_end = response_str.find("</thinking>") + len("</thinking>")
        return response_str[:thinking_start] + response_str[thinking_end:]
    return response_str
