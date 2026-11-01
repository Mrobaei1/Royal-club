# Iranian Manch — Visual Specification

## Product identity
A recognizable Iranian four-colour Manch board, not a reskinned generic foreign Ludo screen. Royal Club styling is applied around the classic board without changing its visual grammar.

## Board anatomy
- Square 15×15 logical grid with four distinct home yards: red (upper-left), green (upper-right), yellow (lower-right), blue (lower-left).
- Four tokens begin in each player's yard.
- A classic 52-cell shared route, not a cross-shaped route. The route is fixed and must not mirror when the locale changes between RTL and LTR.
- Four five-cell, colour-specific home lanes lead from the shared route toward the centre.
- The centre contains the four-colour finish area.
- Entry cells are red (row 6, column 0), green (row 0, column 8), yellow (row 8, column 14), and blue (row 14, column 6), using zero-based grid coordinates.
- The current painter marks those four entry cells as safe. The exact safe-cell policy remains configurable in the rules profile and is not yet owner-approved as the final Iranian house rule.
- Stable seat mapping is independent of Persian RTL text direction.

## Route geometry contract
The route is defined by the ordered 52-cell `trackCells` sequence in `iranian_manch_board.dart`. Its four entry offsets are 0 (red), 13 (green), 26 (yellow), and 39 (blue). The engine and painter must use the same colour starts:
- Red: 0
- Green: 13
- Yellow: 26
- Blue: 39

The home lanes are:
- Red: row 7, columns 1–5
- Green: column 7, rows 1–5
- Yellow: row 7, columns 13–9 (toward the centre)
- Blue: column 7, rows 13–9 (toward the centre)

Keep the route-cell sequence in one source of truth or add a consistency test before changing its order. The painter currently mirrors the same start offsets as the engine; divergence is a release-blocking defect.

## Royal Club treatment
- Outer frame: deep navy `#111B31`.
- Trim and active-player emphasis: gold `#D8B45A`.
- Route: warm ivory `#F7F1E5`.
- Seats: red `#D94747`, green `#239B69`, yellow `#F0C642`, blue `#397BD4`.
- Tokens should be high-contrast and touch targets should be at least 44 logical pixels in the interactive layer.

## Responsive behaviour
- Board maintains a 1:1 aspect ratio.
- Board geometry never mirrors in RTL.
- Player identity, avatar, dice controls, turn timer, and action buttons remain outside the painter.
- Portrait: player panels stack above/below board; landscape may place panels at the sides.
- Do not place critical text inside small route cells.

## Architecture boundary
The board is currently a renderer foundation. Dice generation, move legality, capture, safe-cell logic, turn progression, winner detection and persistence belong to the separate engine/state layer. Networking and server-authoritative validation belong to the future online service.

## Acceptance checks
- All four home yards and all four five-cell home lanes are visible.
- All 52 shared-route cells are present exactly once and are connected in the intended order.
- The four entry cells align with engine start offsets 0/13/26/39.
- Four-colour centre is centred and symmetrical.
- Board remains square at narrow and wide constraints.
- RTL and LTR produce identical board geometry.
- Active seat emphasis does not obscure token colour.
- Theme changes around the board do not erase the four fixed player colours.
- Live game-state token rendering maps yard, shared route, home lane and finish positions correctly.

## Not yet frozen
The owner must still approve the final safe-cell map, local house-rule profile, 2/3-player seat arrangements, and final visual appearance. The current painter is a foundation, not an owner-accepted production screen.
