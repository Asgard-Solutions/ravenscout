"""Implementation guide for the enhanced species prompt system.

This is an executable doc — running it prints the same checklist that
lives in the docstrings, plus a quick environment sanity check that
everything imports correctly.

    cd /app/backend
    python -m species_prompts.enhanced.enhancement_guide

Key integration points
----------------------

1. Enable enhanced extensions opt-in via the new flags on
   `prompt_builder.assemble_system_prompt(...)`:

       assemble_system_prompt(
           animal="whitetail",
           conditions=conditions,
           image_count=1,
           tier="pro",
           use_enhanced_behavior=True,
           use_enhanced_access=True,
           use_enhanced_regional=True,
           enhanced_pressure_level=PressureLevel.HIGH,
           enhanced_terrain=TerrainType.AGRICULTURAL,
           enhanced_terrain_features=terrain_features,
       )

   When all flags default to False the prompt is byte-identical to the
   legacy build.

2. For standalone analysis or testing, call `EnhancedPromptBuilder` directly:

       components = EnhancedPromptBuilder().build(ctx)
       block = components.to_prompt_block()

3. Adding a new enhanced behavior pattern — register an
   `EnhancedBehaviorPattern` in `behavior_framework.py`'s `_REGISTRY`
   keyed by ``(species, pattern_type)``. Modifications fire only when
   their `EnvironmentalTrigger` matches the supplied context.

4. Adding a new enhanced regional modifier — declare an
   `EnhancedRegionalModifier` in `regional_modifiers.py` and add it to
   `ENHANCED_REGIONAL_REGISTRY`. The class subclasses the existing
   `RegionalModifier` so the legacy regional pipeline keeps working.

5. Backward compatibility contract:
   - Public functions / classes in `species_prompts/__init__.py` MUST NOT
     change name or signature.
   - `prompt_builder.assemble_system_prompt(...)` MUST return identical
     output when no `use_enhanced_*` flag is passed.
   - The enhanced layer ONLY appends prompt content. It never edits the
     base species pack, regional modifier, seasonal modifier, or hunt-style
     modifier output.

6. Rollout posture: ALL flags default to False. Validate per species and
   per region by toggling them on for a single endpoint or test fixture
   first. Deploy enabled defaults only after offline review of the
   resulting prompts.
"""

from __future__ import annotations

from typing import List


def self_check() -> List[str]:
    """Return a list of issues; empty list means everything is wired correctly."""
    issues: List[str] = []

    try:
        from species_prompts.enhanced import (
            BehaviorModification,
            EnhancedBehaviorPattern,
            EnhancedHuntContext,
            EnhancedPromptBuilder,
            EnhancedRegionalModifier,
            EnvironmentalFactor,
            EnvironmentalTrigger,
            PressureLevel,
            TerrainCharacteristics,
            TerrainType,
            analyze_access_options,
            build_enhanced_master_prompt,
            create_enhanced_hunt_context,
            generate_terrain_alternatives,
            get_enhanced_behavior_pattern,
            get_enhanced_regional_modifier,
            get_terrain_movement_pattern,
            identify_access_points,
            integrate_environmental_factors,
            list_enhanced_behavior_patterns,
            render_enhanced_access_block,
            render_enhanced_behavior_block,
            render_enhanced_regional_block,
        )
    except Exception as exc:  # pragma: no cover
        issues.append(f"import_failed: {exc}")
        return issues

    # All four required regions resolve.
    for region_id in ("south_texas", "colorado_high_country", "midwest_agricultural", "pacific_northwest"):
        if get_enhanced_regional_modifier(region_id) is None:
            issues.append(f"missing_region: {region_id}")

    # At least one whitetail behavior pattern registered.
    if not list_enhanced_behavior_patterns("whitetail"):
        issues.append("missing_pattern: whitetail/*")
    if not list_enhanced_behavior_patterns("turkey"):
        issues.append("missing_pattern: turkey/*")

    # Backward-compat: assemble_system_prompt accepts enhanced flags as kwargs.
    try:
        from prompt_builder import assemble_system_prompt
        legacy = assemble_system_prompt(
            animal="whitetail",
            conditions={"hunt_date": "2026-11-15", "time_window": "morning"},
            image_count=1,
            tier="pro",
        )
        enhanced = assemble_system_prompt(
            animal="whitetail",
            conditions={"hunt_date": "2026-11-15", "time_window": "morning"},
            image_count=1,
            tier="pro",
            use_enhanced_behavior=True,
            use_enhanced_access=False,
            use_enhanced_regional=True,
            enhanced_pressure_level=PressureLevel.HIGH,
            enhanced_region_id="midwest_agricultural",
        )
        if not enhanced.startswith(legacy):
            issues.append("enhanced_prompt_does_not_extend_legacy")
        if "ENHANCED PROMPT EXTENSIONS" not in enhanced:
            issues.append("enhanced_banner_missing")
    except TypeError as exc:
        issues.append(f"assemble_system_prompt_signature_mismatch: {exc}")
    except Exception as exc:  # pragma: no cover
        issues.append(f"assemble_system_prompt_failed: {exc}")

    return issues


if __name__ == "__main__":  # pragma: no cover
    issues = self_check()
    if issues:
        print("Enhancement guide self-check FAILED:")
        for issue in issues:
            print(f"  - {issue}")
        raise SystemExit(1)
    print("Enhancement guide self-check PASSED.")
