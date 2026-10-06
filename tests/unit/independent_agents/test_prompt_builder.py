"""Prompt layer: spec validation, rendering contract, and spec/response agreement."""

import dataclasses
import re

import pytest

from backend.ai.independent_agents.linkedin import LinkedInPost
from backend.ai.independent_agents.prompts.builder import (
    HONESTY_RULES,
    SHARED_BANNED_PATTERNS,
    SystemPromptBuilder,
)
from backend.ai.independent_agents.prompts.platform_specs import LINKEDIN_PROMPT, REDDIT_PROMPT, X_PROMPT
from backend.ai.independent_agents.prompts.spec import PromptContext
from backend.ai.independent_agents.reddit import RedditPostResponse
from backend.ai.independent_agents.x import XPostResponse

SPEC_AND_RESPONSE = [
    (LINKEDIN_PROMPT, LinkedInPost),
    (REDDIT_PROMPT, RedditPostResponse),
    (X_PROMPT, XPostResponse),
]
ALL_SPECS = [spec for spec, _ in SPEC_AND_RESPONSE]


def _tags(text: str) -> list[str]:
    return re.findall(r"^<([a-z_]+)>$", text, flags=re.MULTILINE)


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda s: s.platform)
def test_sections_render_in_fixed_order(spec):
    assert _tags(SystemPromptBuilder.build(spec).text) == [
        "persona", "platform_mechanics", "voice", "format", "banned_patterns", "honesty", "output_contract",
    ]


@pytest.mark.parametrize("spec", ALL_SPECS, ids=lambda s: s.platform)
def test_every_spec_carries_shared_rules(spec):
    text = SystemPromptBuilder.build(spec).text
    for rule in HONESTY_RULES + SHARED_BANNED_PATTERNS:
        assert f"- {rule}" in text


@pytest.mark.parametrize(("spec", "response"), SPEC_AND_RESPONSE, ids=lambda x: getattr(x, "platform", ""))
def test_contract_names_every_field(spec, response):
    for field in response.model_fields:
        assert f"`{field}`" in spec.output_contract, f"{spec.platform} contract misses `{field}`"


def test_empty_context_adds_no_slots():
    rendered = SystemPromptBuilder.build(X_PROMPT, PromptContext(brand_voice="  ", knowledge=None))
    assert rendered.slots_included == ()
    assert "<knowledge>" not in rendered.text and "<brand_voice>" not in rendered.text


def test_filled_slots_render_before_output_contract():
    rendered = SystemPromptBuilder.build(X_PROMPT, PromptContext(brand_voice="dry", knowledge="Q3 doc"))
    assert rendered.slots_included == ("brand_voice", "knowledge")
    assert _tags(rendered.text)[-3:] == ["brand_voice", "knowledge", "output_contract"]
    assert "Q3 doc" in rendered.text


def test_build_is_deterministic_and_hash_tracks_content():
    a = SystemPromptBuilder.build(LINKEDIN_PROMPT)
    assert a == SystemPromptBuilder.build(LINKEDIN_PROMPT)
    assert a.char_length == len(a.text) and len(a.content_hash) == 12
    changed = dataclasses.replace(LINKEDIN_PROMPT, persona="Someone else.")
    assert SystemPromptBuilder.build(changed).content_hash != a.content_hash


@pytest.mark.parametrize(
    "override",
    [{"platform": "Linked In"}, {"persona": "  "}, {"mechanics": ()}, {"voice_rules": ("ok", " ")}],
)
def test_invalid_spec_raises(override):
    with pytest.raises(ValueError):
        dataclasses.replace(X_PROMPT, **override)
