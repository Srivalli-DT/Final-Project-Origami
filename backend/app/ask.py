"""'Ask' help for a tutorial step: Gemini answer with a template fallback."""
from __future__ import annotations

import os
from collections import OrderedDict
from typing import Callable

TIMEOUT_MS = 6000
CACHE_SIZE = 512

SYSTEM_PROMPT = (
    "You are a patient origami teacher helping someone fold a model step by step. "
    "Answer in at most 3 short sentences of plain text. Use only the step you are given: "
    "never invent creases, steps or measurements. Valley folds come toward the folder, "
    "mountain folds go away."
)

Generator = Callable[[str, str], str]
_cache: "OrderedDict[tuple, str]" = OrderedDict()


def template(step: dict, question: str | None) -> str:
    tip = (step.get("tips") or [""])[0]
    mistake = (step.get("mistakes") or [""])[0]
    parts = [step.get("instruction", "")]
    if tip:
        parts.append(f"Tip: {tip}")
    if mistake:
        parts.append(f"Watch out for this: {mistake}")
    if step.get("check"):
        parts.append(f"You should see: {step['check']}")
    return " ".join(p if p.endswith(".") else p + "." for p in parts if p)


def build_prompt(tutorial: dict, step: dict, question: str | None) -> str:
    lines = [
        f"Model: {tutorial.get('title', '')}",
        f"Step {step.get('index', 0) + 1} of {len(tutorial.get('steps', []))}: {step.get('title', '')}",
        f"Instruction: {step.get('instruction', '')}",
        f"Tips: {'; '.join(step.get('tips', []))}",
        f"Common mistakes: {'; '.join(step.get('mistakes', []))}",
    ]
    if step.get("check"):
        lines.append(f"Expected result: {step['check']}")
    lines.append(f"Question: {question}" if question else
                 "Question: I'm stuck. Explain this step more simply.")
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
            system_instruction=system, temperature=0.4, max_output_tokens=220,
            thinking_config=types.ThinkingConfig(thinking_budget=0)),
    )
    return (resp.text or "").strip()


def ask(tutorial: dict, step_index: int, question: str | None = None,
        generator: Generator | None = None) -> dict:
    step = tutorial["steps"][step_index]
    q = (question or "").strip() or None
    key = (tutorial["id"], step_index, (q or "").lower())
    if key in _cache:
        _cache.move_to_end(key)
        return {"text": _cache[key], "source": "gemini"}
    gen = generator or (_gemini if os.getenv("GEMINI_API_KEY") else None)
    if gen is not None:
        try:
            text = gen(SYSTEM_PROMPT, build_prompt(tutorial, step, q))
            if text:
                _cache[key] = text
                if len(_cache) > CACHE_SIZE:
                    _cache.popitem(last=False)
                return {"text": text, "source": "gemini"}
        except Exception:  # noqa: BLE001 - any failure falls back to the template
            pass
    return {"text": template(step, q), "source": "template"}


def clear_cache() -> None:
    _cache.clear()
