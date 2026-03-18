import re

RU_MAP = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y",
    "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
    "х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
}

def translit(s: str) -> str:
    s = s.lower()
    out = []
    for ch in s:
        out.append(RU_MAP.get(ch, ch))
    return "".join(out)

def slugify(text: str, max_len: int = 96) -> str:
    if not text:
        return "item"
    text = translit(text)
    text = re.sub(r"[^a-z0-9\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace(" ", "-")
    text = re.sub(r"-{2,}", "-", text).strip("-")
    if not text:
        text = "item"
    return text[:max_len].strip("-") or "item"
