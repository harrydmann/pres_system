"""
Fixed stage → .pptx exporter (STUB)

Reads a deck.md written for the fixed stage and fills placeholders in the
firm's PowerPoint template, so the output is a native, editable deck that
inherits the template's fonts, colours, bullets and footer.

Usage:
    pip install python-pptx
    python export_pptx.py ../../../decks/demo-proposal/deck.md template.potx out.pptx

To finish this on the work machine:
  1. Open the .potx, note each layout's name and the placeholder idx of
     each slot (View → Slide Master; or print them with `inspect_template`).
  2. Fill LAYOUT_MAP below. Keys are the layout names used in deck.md.
  3. Decide how media and charts are handled (picture placeholder vs
     native chart) and extend `fill_slot`.
"""
import re
import sys
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.util import Pt
except ImportError:  # keep the stub importable without the dependency
    Presentation = None

# layout name in deck.md → (template layout name, {slot: placeholder idx})
# TEMPLATE: replace with the real names and indices.
LAYOUT_MAP = {
    "title-slide":    ("Title Slide",       {"heading": 0, "body": 1}),
    "section-header": ("Section Header",    {"heading": 0, "eyebrow": 1}),
    "title-content":  ("Title and Content", {"heading": 0, "body": 1}),
    "two-content":    ("Two Content",       {"heading": 0, "left": 1, "right": 2}),
    "title-only":     ("Title Only",        {"heading": 0}),
}


# ---------- deck.md parsing (mirrors engine/app.js) ----------
def parse_kv(block: str) -> dict:
    out = {}
    for line in block.splitlines():
        m = re.match(r"^\s*([\w-]+)\s*:\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def parse_slots(body: str) -> dict:
    body = body.strip()
    if not re.search(r"^::\s*\w", body, re.M):
        lines = body.splitlines()
        heading = "\n".join(l[2:] for l in lines if l.startswith("# "))
        rest = "\n".join(l for l in lines if not l.startswith("# ")).strip()
        slots = {}
        if heading:
            slots["heading"] = heading
        if rest:
            slots["body"] = rest
        return slots
    slots, name, buf = {}, None, []
    for line in body.splitlines():
        m = re.match(r"^::\s*([\w-]+)\s*$", line)
        if m:
            if name:
                slots[name] = "\n".join(buf).strip()
            name, buf = m.group(1), []
        else:
            buf.append(line)
    if name:
        slots[name] = "\n".join(buf).strip()
    return slots


def parse_deck(text: str):
    text = text.replace("\r\n", "\n")
    meta, rest = {}, text
    fm = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if fm:
        meta = parse_kv(fm.group(1))
        rest = text[fm.end():]
    parts = re.split(r"^===\s*$", rest, flags=re.M)
    scenes = []
    for i in range(1, len(parts), 2):
        header = parse_kv(parts[i])
        body = parts[i + 1] if i + 1 < len(parts) else ""
        scenes.append({**header, "slots": parse_slots(body)})
    return meta, scenes


# ---------- pptx ----------
def inspect_template(path: str):
    """Print layout names and placeholder indices — run this first."""
    prs = Presentation(path)
    for layout in prs.slide_layouts:
        print(f"[{layout.name}]")
        for ph in layout.placeholders:
            print(f"   idx={ph.placeholder_format.idx:<3} type={ph.placeholder_format.type} name={ph.name!r}")


def fill_slot(placeholder, content: str):
    """Minimal: paragraphs and '- ' bullets. Extend for media/charts."""
    tf = placeholder.text_frame
    tf.clear()
    first = True
    for para in re.split(r"\n{2,}", content):
        for line in para.splitlines():
            line = re.sub(r"\[\[(.+?)\]\]", r"\1", line)
            bullet = bool(re.match(r"^(-|\*|\d+\.)\s", line))
            text = re.sub(r"^(-|\*|\d+\.)\s+", "", line)
            text = re.sub(r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`", lambda m: next(g for g in m.groups() if g), text)
            p = tf.paragraphs[0] if first else tf.add_paragraph()
            first = False
            p.text = text
            p.level = 0 if bullet else 0  # TEMPLATE: map levels if the master uses them


def export(deck_md: str, template: str, out: str):
    if Presentation is None:
        sys.exit("python-pptx is not installed: pip install python-pptx")
    meta, scenes = parse_deck(Path(deck_md).read_text(encoding="utf-8"))
    if meta.get("stage") != "fixed":
        sys.exit("Only fixed-stage decks can be exported")

    prs = Presentation(template)
    layouts = {l.name: l for l in prs.slide_layouts}

    for scene in scenes:
        name = scene.get("layout", "title-content")
        if name not in LAYOUT_MAP:
            print(f"skip: no mapping for layout {name!r}")
            continue
        ppt_layout_name, slot_map = LAYOUT_MAP[name]
        if ppt_layout_name not in layouts:
            print(f"skip: template has no layout {ppt_layout_name!r}")
            continue
        slide = prs.slides.add_slide(layouts[ppt_layout_name])
        by_idx = {ph.placeholder_format.idx: ph for ph in slide.placeholders}
        for slot, content in scene["slots"].items():
            idx = slot_map.get(slot)
            if idx is None or idx not in by_idx:
                print(f"  {name}: no placeholder for slot {slot!r}")
                continue
            if content.startswith("[placeholder") or content.startswith("!["):
                print(f"  {name}: media slot {slot!r} not yet handled")
                continue
            fill_slot(by_idx[idx], content)

    prs.save(out)
    print(f"wrote {out} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "inspect":
        inspect_template(sys.argv[2])
    elif len(sys.argv) == 4:
        export(*sys.argv[1:])
    else:
        print(__doc__)
