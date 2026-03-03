"""Tests for scripts/generate_patentnet_pdf.py"""
import importlib.util
import sys
from pathlib import Path

import pytest

# Load the module directly to avoid any package resolution issues
_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate_patentnet_pdf.py"
spec = importlib.util.spec_from_file_location("generate_patentnet_pdf", _SCRIPT)
_mod = importlib.util.module_from_spec(spec)
sys.modules["generate_patentnet_pdf"] = _mod
spec.loader.exec_module(_mod)

build_patentnet_pdf = _mod.build_patentnet_pdf
_build_styles = _mod._build_styles
_build_sections = _mod._build_sections
_build_results = _mod._build_results
_build_discussion_and_conclusion = _mod._build_discussion_and_conclusion
_build_references = _mod._build_references
_build_title_page = _mod._build_title_page


def test_styles_built():
    styles = _build_styles()
    assert "TitleCenter" in styles
    assert "Subtitle" in styles
    assert "BodyTextJustified" in styles
    assert "Heading2Left" in styles
    assert "Reference" in styles


def test_title_page_non_empty():
    styles = _build_styles()
    story = _build_title_page(styles)
    assert len(story) > 0


def test_sections_non_empty():
    styles = _build_styles()
    story = _build_sections(styles)
    assert len(story) > 0


def test_results_non_empty():
    styles = _build_styles()
    story = _build_results(styles)
    assert len(story) > 0


def test_discussion_and_conclusion_non_empty():
    styles = _build_styles()
    story = _build_discussion_and_conclusion(styles)
    assert len(story) > 0


def test_references_non_empty():
    styles = _build_styles()
    story = _build_references(styles)
    assert len(story) > 0


def test_build_patentnet_pdf(tmp_path):
    out = tmp_path / "patentnet-manuscript.pdf"
    build_patentnet_pdf(out)
    assert out.exists()
    assert out.stat().st_size > 1000  # non-trivial PDF
    # PDF magic bytes
    assert out.read_bytes()[:4] == b"%PDF"
