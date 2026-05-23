# Weather Forecast Card Layout Redesign

**Date:** 2026-05-22  
**File:** `screens/Weather.jsx`

## Problem

Forecast cards in the "Next 12 Hours" section are too short and use a cramped two-column layout (icon left | divider | temp/time/wind right).

## Solution

Switch each forecast card to a single-column stacked layout with the icon at the bottom, and increase the temperature font size.

## Changes to `screens/Weather.jsx`

### Forecast card (lines 44–58)

**Remove:**
- Horizontal flex layout inside each card
- Internal mini-divider between icon and text
- Left icon column / right text column structure

**Replace with:**
- `flexDirection: 'column'`, `alignItems: 'center'`, `justifyContent: 'center'`
- Stack order: time → temp → wind → icon
- Increased vertical padding: `2.5vh 0` (was `1.5vh 0`)
- Gap between items: `0.4vh`

### Font sizes

| Element | Before | After |
|---------|--------|-------|
| Temp    | `2.5vw`, weight 500 | `3.5vw`, weight 700 |
| Time    | `1.5vw` | `1.8vw` |
| Wind    | `1.5vw` | unchanged |
| Icon    | `4vw` (left column) | `2.8vw` (centered below) |

## Out of scope

- Left-side current conditions block — no change
- Number of forecast slots — no change
- Wind field — kept (can be dropped in a future pass)
