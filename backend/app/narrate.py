"""Step narration: Gemini rewrite with a template fallback."""
from __future__ import annotations

import os
from collections import OrderedDict
from typing import Any, Callable

TIMEOUT_MS = 6000
CACHE_SIZE = 256

SYSTEM_PROMPT = (
    "You are a patient origami teacher. Rewrite the given folding step for a beginner in "
    "1-3 short sentences. Use the geometry you are given (where the line is, and whether it "
    "is a valley fold toward the folder or a mountain fold away from them). Never invent "
    "creases, steps or measurements that are not in the input. Plain text only, no markdown."
)
SIMPLER_EXTRA = (
    " Then say what the paper should look like after this step, and name one common mistake "
    "to avoid. Keep the whole answer under 5 short sentences."
)

_AFTER = {
    "reference": "After unfolding you should see one straight crease across the square.",
    "precrease": "After unfolding the paper lies flat again with one more crease line.",
    "collapse": "At the end the paper should lie flat with every crease folded in its colour.",
    "assembly": "Each unit should hold the next one without glue.",
}
_MISTAKE = {
    "reference": "A common mistake is not lining the edges or corners up exactly before pressing.",
    "precrease": "A common mistake is folding the wrong way: valleys come toward you, mountains go away.",
    "collapse": "A common mistake is forcing one crease at a time; bring them in together, gently.",
    "assembly": "A common mistake is folding one unit as a mirror image of the others.",
}

_cache: "OrderedDict[tuple, str]" = OrderedDict()

# injectable for tests: (system, prompt) -> text
Generator = Callable[[str, str], str]


def template(step: dict, mode: str) -> str:
    text = step.get("text") or step.get("title") or ""
    if mode != "simpler":
        return text
    kind = step.get("kind", "precrease")
    return " ".join(
        part for part in (
            text,
            "Go slowly and line things up before you crease.",
            _AFTER.get(kind, ""),
            _MISTAKE.get(kind, ""),
        ) if part
    )


def _describe(step: dict) -> str:
    lines = [f"Step: {step.get('title', '')}", f"Kind: {step.get('kind', '')}",
             f"Instruction: {step.get('text', '')}"]
    if step.get("line"):
        (x1, y1), (x2, y2) = step["line"]
        lines.append(
            f"Fold line from ({x1:.3f}, {y1:.3f}) to ({x2:.3f}, {y2:.3f}) on a unit square "
            "with (0,0) at the bottom-left corner."
        )
    if step.get("assignment") in ("M", "V"):
        lines.append("Fold type: " + ("valley (toward you)" if step["assignment"] == "V"
                                      else "mountain (away from you)"))
    return "\n".join(lines)


def _gemini(system: str, prompt: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"],
                          http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    resp = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.4,
            max_output_tokens=300,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return (resp.text or "").strip()


def narrate(step: dict, mode: str = "normal", generator: Generator | None = None) -> dict[str, Any]:
    """Return {text, source}. Falls back to template text on any error or a missing key."""
    key = (step.get("text", ""), step.get("kind", ""), mode)
    if key in _cache:
        _cache.move_to_end(key)
        return {"text": _cache[key], "source": "gemini"}
    gen = generator
    if gen is None and os.getenv("GEMINI_API_KEY"):
        gen = _gemini
    if gen is not None:
        try:
            system = SYSTEM_PROMPT + (SIMPLER_EXTRA if mode == "simpler" else "")
            text = gen(system, _describe(step))
            if text:
                _cache[key] = text
                if len(_cache) > CACHE_SIZE:
                    _cache.popitem(last=False)
                return {"text": text, "source": "gemini"}
        except Exception:  # noqa: BLE001 - any failure falls back to the template
            pass
    return {"text": template(step, mode), "source": "template"}


def clear_cache() -> None:
    _cache.clear()
