"""
Deathshot Arsenal — Centralized AI Core: Streaming output filter
Drops chain-of-thought blocks from streamed LLM tokens for every backend.
"""

import re

_OPEN_TAGS = ("<think>", "<thought>", "<reasoning>")
_CLOSE_TAGS = ("</think>", "</thought>", "</reasoning>")
_ANY_TAG = re.compile(r"</?(?:think|thought|reasoning|analysis)>")


class GenerationCancelled(RuntimeError):
    """Raised when a generation is aborted; carries the text produced so far."""

    def __init__(self, text=""):
        super().__init__("Generation cancelled by user.")
        self.text = text


class ThinkFilter:
    """Feed streamed pieces in order; returns the visible part of each piece."""

    def __init__(self):
        self.in_think = False

    def feed(self, piece: str) -> str:
        if any(t in piece for t in _OPEN_TAGS):
            self.in_think = True
        if self.in_think:
            if any(t in piece for t in _CLOSE_TAGS):
                self.in_think = False
            return ""
        if "<" in piece and _ANY_TAG.search(piece):
            piece = _ANY_TAG.sub("", piece)
            if not piece.strip():
                return ""
        return piece


def strip_leading_tag(text: str) -> str:
    return re.sub(r"^\s*</?(?:think|thought|reasoning|analysis)>\s*", "", text).strip()
